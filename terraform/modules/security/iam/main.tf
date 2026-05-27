variable "github_repo" {}   # "jamesboder/daemon-code"
variable "environment"  {}
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

output "github_actions_role_arn" { value = aws_iam_role.github_actions.arn }
