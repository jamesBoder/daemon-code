variable "github_repo" {}   # "jamesboder/daemon-code"
variable "environment"  {}
variable "aws_region"   { default = "us-east-1" }
variable "tags"         { type = map(string) }

data "aws_caller_identity" "current" {}

# Register GitHub as an OIDC identity provider
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Thumbprint for token.actions.githubusercontent.com — stable, GitHub-published
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = var.tags
}

# Role GitHub Actions assumes when running CD workflows
resource "aws_iam_role" "github_actions" {
  name = "daemon-code-github-actions-${var.environment}"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

# Permissions: S3 write + CloudFront invalidation (Phase 0)
# Lambda update added in Phase 2
resource "aws_iam_role_policy" "github_actions_phase0" {
  name = "daemon-code-github-actions-phase0"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Frontend"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::daemon-code-frontend-${data.aws_caller_identity.current.account_id}",
          "arn:aws:s3:::daemon-code-frontend-${data.aws_caller_identity.current.account_id}/*",
          "arn:aws:s3:::daemon-code-audio-${data.aws_caller_identity.current.account_id}",
          "arn:aws:s3:::daemon-code-audio-${data.aws_caller_identity.current.account_id}/*"
        ]
      },
      {
        Sid      = "CloudFrontInvalidation"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = ["*"]
      }
    ]
  })
}

# Phase 2: Lambda deploy permissions — allows cd-backend.yml to push new code
resource "aws_iam_role_policy" "github_actions_phase2" {
  name = "daemon-code-github-actions-phase2"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaDeploy"
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:daemon-code-*"
        ]
      }
    ]
  })
}

# Terraform state — allows tf-plan.yml and tf-apply.yml to read/write state
resource "aws_iam_role_policy" "github_actions_tfstate" {
  name = "daemon-code-github-actions-tfstate"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "TFStateBucket"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::daemon-code-tfstate-${data.aws_caller_identity.current.account_id}",
          "arn:aws:s3:::daemon-code-tfstate-${data.aws_caller_identity.current.account_id}/*"
        ]
      },
      {
        Sid    = "TFStateLock"
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/daemon-code-tfstate-lock"
      }
    ]
  })
}

# Phase 4: Terraform resource management — allows tf-apply.yml to create/update/delete
# all infra resources. Scoped to daemon-code-* where ARN patterns support it.
resource "aws_iam_role_policy" "github_actions_terraform" {
  name = "daemon-code-github-actions-terraform"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManager"
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:CreateSecret",
          "secretsmanager:UpdateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:TagResource",
          "secretsmanager:ListSecretVersionIds"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:daemon-code-*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:PutRetentionPolicy",
          "logs:ListTagsLogGroup",
          "logs:ListTagsForResource",
          "logs:TagLogGroup"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchDashboards"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetDashboard",
          "cloudwatch:PutDashboard",
          "cloudwatch:DeleteDashboards",
          "cloudwatch:ListDashboards"
        ]
        Resource = "*"
      },
      {
        Sid    = "IAMOIDCAndRoles"
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:GetRole",
          "iam:CreateRole",
          "iam:UpdateRole",
          "iam:DeleteRole",
          "iam:TagRole",
          "iam:ListRolePolicies",
          "iam:GetRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PassRole"
        ]
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/daemon-code-*"
        ]
      },
      {
        Sid      = "LambdaManage"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:daemon-code-*",
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:event-source-mapping:*"
        ]
      },
      {
        Sid    = "SQSManage"
        Effect = "Allow"
        Action = [
          "sqs:CreateQueue",
          "sqs:DeleteQueue",
          "sqs:GetQueueAttributes",
          "sqs:SetQueueAttributes",
          "sqs:ListQueueTags",
          "sqs:TagQueue",
          "sqs:GetQueueUrl"
        ]
        Resource = "arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:daemon-code-*"
      },
      {
        Sid    = "EventBridgeManage"
        Effect = "Allow"
        Action = [
          "events:DescribeRule",
          "events:PutRule",
          "events:DeleteRule",
          "events:ListTargetsByRule",
          "events:PutTargets",
          "events:RemoveTargets",
          "events:TagResource",
          "events:ListTagsForResource",
          "events:DescribeEventBus",
          "events:CreateEventBus",
          "events:DeleteEventBus"
        ]
        Resource = [
          "arn:aws:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:rule/daemon-code-*",
          "arn:aws:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:event-bus/daemon-code-*"
        ]
      },
      {
        Sid    = "APIGatewayManage"
        Effect = "Allow"
        Action = ["apigateway:*"]
        Resource = [
          "arn:aws:apigateway:${var.aws_region}::/apis",
          "arn:aws:apigateway:${var.aws_region}::/apis/*",
          "arn:aws:apigateway:${var.aws_region}::/domainnames",
          "arn:aws:apigateway:${var.aws_region}::/domainnames/*"
        ]
      },
      {
        Sid    = "ACMManage"
        Effect = "Allow"
        Action = [
          "acm:RequestCertificate",
          "acm:DescribeCertificate",
          "acm:DeleteCertificate",
          "acm:ListTagsForCertificate",
          "acm:AddTagsToCertificate"
        ]
        Resource = "*"
      },
      {
        Sid    = "S3Manage"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetEncryptionConfiguration",
          "s3:PutEncryptionConfiguration",
          "s3:GetBucketPolicy",
          "s3:PutBucketPolicy",
          "s3:DeleteBucketPolicy",
          "s3:GetBucketAcl",
          "s3:GetBucketCORS",
          "s3:PutBucketCORS",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetBucketLogging",
          "s3:PutBucketLogging",
          "s3:GetBucketTagging",
          "s3:PutBucketTagging",
          "s3:GetAccelerateConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetReplicationConfiguration",
          "s3:GetBucketObjectLockConfiguration",
          "s3:GetBucketWebsite",
          "s3:GetBucketRequestPayment"
        ]
        Resource = [
          "arn:aws:s3:::daemon-code-*"
        ]
      },
      {
        Sid    = "DynamoDBManage"
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable",
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:UpdateTable",
          "dynamodb:TagResource",
          "dynamodb:ListTagsOfResource",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:UpdateTimeToLive",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:UpdateContinuousBackups"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/daemon-code-*"
      },
      {
        Sid      = "EC2ReadOnly"
        Effect   = "Allow"
        Action   = ["ec2:Describe*"]
        Resource = "*"
      },
    ]
  })
}

output "github_actions_role_arn" { value = aws_iam_role.github_actions.arn }
