variable "app_name"              {}
variable "environment"           {}
variable "aws_region"            {}
variable "db_secret_arn"         {}
variable "jwt_secret_arn"        {}
variable "anthropic_secret_arn"  {}
variable "vapid_secret_arn"      {}
variable "audio_bucket_name"     {}
variable "audio_bucket_arn"      {}
variable "static_domain"         {}
variable "cloudfront_id"         { default = "" }   # empty until CF account verified
variable "dynamo_table_decks"    {}
variable "dynamo_table_state"    {}
variable "dynamo_table_decks_arn"{}
variable "dynamo_table_state_arn"{}
variable "tags"                  { type = map(string) }

# Placeholder zip — content "placeholder" in a file named "bootstrap".
# Lambda code is deployed and updated by cd-backend.yml; Terraform manages only config.
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"
  source {
    content  = "placeholder"
    filename = "bootstrap"
  }
}

# ── Lambda execution IAM role ─────────────────────────────────────────────────

resource "aws_iam_role" "lambda_exec" {
  name = "${var.app_name}-lambda-exec-${var.environment}"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_exec" {
  name = "${var.app_name}-lambda-exec"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"
        ]
        Resource = [var.dynamo_table_decks_arn, var.dynamo_table_state_arn]
      },
      {
        Sid    = "SQSSend"
        Effect = "Allow"
        Action = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.analyst.arn]
      },
      {
        Sid    = "SQSConsume"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"
        ]
        Resource = [aws_sqs_queue.analyst.arn, aws_sqs_queue.analyst_dlq.arn]
      },
      {
        Sid      = "EventBridge"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [aws_cloudwatch_event_bus.main.arn]
      },
      {
        Sid      = "Polly"
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech"]
        Resource = ["*"]
      },
      {
        Sid      = "S3Audio"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = ["${var.audio_bucket_arn}/*"]
      },
      {
        Sid    = "SecretsManager"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          var.db_secret_arn,
          var.jwt_secret_arn,
          var.anthropic_secret_arn,
          var.vapid_secret_arn
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

# ── SQS — per-user Analyst fan-out ────────────────────────────────────────────

resource "aws_sqs_queue" "analyst_dlq" {
  name                      = "${var.app_name}-analyst-dlq"
  message_retention_seconds = 1209600
  tags                      = var.tags
}

resource "aws_sqs_queue" "analyst" {
  name                       = "${var.app_name}-analyst"
  visibility_timeout_seconds = 300   # must be >= analyst Lambda timeout
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analyst_dlq.arn
    maxReceiveCount     = 3
  })

  tags = var.tags
}

# ── EventBridge ───────────────────────────────────────────────────────────────

resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.app_name}-events"
  tags = var.tags
}

# Nightly cron → Orchestrator → SQS fan-out
resource "aws_cloudwatch_event_rule" "nightly_compile" {
  name                = "${var.app_name}-nightly-compile"
  schedule_expression = "cron(0 23 * * ? *)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "nightly_orchestrator" {
  rule      = aws_cloudwatch_event_rule.nightly_compile.name
  target_id = "Orchestrator"
  arn       = aws_lambda_function.orchestrator.arn
}

resource "aws_lambda_permission" "eventbridge_orchestrator" {
  statement_id  = "AllowEventBridgeOrchestrator"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orchestrator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_compile.arn
}

# ShadowAnalystComplete → Narrator + DeckGenerator + Notifier (parallel)
# Phase 4: split Notifier onto ShadowNarratorComplete so prose exists when push fires.
resource "aws_cloudwatch_event_rule" "analyst_complete" {
  name           = "${var.app_name}-analyst-complete"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  tags           = var.tags

  event_pattern = jsonencode({
    source        = ["daemon-code.analyst"]
    "detail-type" = ["ShadowAnalystComplete"]
  })
}

resource "aws_cloudwatch_event_target" "analyst_complete_narrator" {
  event_bus_name = aws_cloudwatch_event_bus.main.name
  rule           = aws_cloudwatch_event_rule.analyst_complete.name
  target_id      = "ShadowNarrator"
  arn            = aws_lambda_function.narrator.arn
}

resource "aws_cloudwatch_event_target" "analyst_complete_deckgen" {
  event_bus_name = aws_cloudwatch_event_bus.main.name
  rule           = aws_cloudwatch_event_rule.analyst_complete.name
  target_id      = "DeckGenerator"
  arn            = aws_lambda_function.deckgen.arn
}

resource "aws_cloudwatch_event_target" "analyst_complete_notifier" {
  event_bus_name = aws_cloudwatch_event_bus.main.name
  rule           = aws_cloudwatch_event_rule.analyst_complete.name
  target_id      = "NightlyNotifier"
  arn            = aws_lambda_function.notifier.arn
}

resource "aws_lambda_permission" "eventbridge_narrator" {
  statement_id  = "AllowEventBridgeNarrator"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.narrator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.analyst_complete.arn
}

resource "aws_lambda_permission" "eventbridge_deckgen" {
  statement_id  = "AllowEventBridgeDeckGen"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.deckgen.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.analyst_complete.arn
}

resource "aws_lambda_permission" "eventbridge_notifier" {
  statement_id  = "AllowEventBridgeNotifier"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.analyst_complete.arn
}

# ── Lambda shared env vars ─────────────────────────────────────────────────────

locals {
  lambda_env = {
    # AWS_REGION is a Lambda reserved env var — do not set it here.
    # Lambda injects it automatically; os.Getenv("AWS_REGION") in config.go reads it directly.
    DB_SECRET_ARN              = var.db_secret_arn
    JWT_SECRET_ARN             = var.jwt_secret_arn
    ANTHROPIC_API_KEY_ARN      = var.anthropic_secret_arn
    VAPID_SECRET_ARN           = var.vapid_secret_arn
    AUDIO_BUCKET               = var.audio_bucket_name
    STATIC_DOMAIN              = var.static_domain
    CLOUDFRONT_DISTRIBUTION_ID = var.cloudfront_id   # empty until CF verified; DeckGen skips invalidation gracefully
    SQS_ANALYST_QUEUE_URL      = aws_sqs_queue.analyst.url
    DYNAMO_TABLE_DECKS         = var.dynamo_table_decks
    DYNAMO_TABLE_STATE         = var.dynamo_table_state
    EVENT_BUS_NAME             = aws_cloudwatch_event_bus.main.name
    ENVIRONMENT                = var.environment
  }
}

# ── Lambda functions ──────────────────────────────────────────────────────────
# Terraform manages configuration (memory, timeout, env vars, IAM).
# cd-backend.yml manages code (builds binary, updates via update-function-code).
# lifecycle.ignore_changes prevents Terraform from reverting CI code deploys.

resource "aws_lambda_function" "api" {
  function_name = "${var.app_name}-api"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }
}

resource "aws_lambda_function" "orchestrator" {
  function_name = "${var.app_name}-orchestrator"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 300
  memory_size   = 128

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

resource "aws_lambda_function" "analyst" {
  function_name = "${var.app_name}-analyst"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 300
  memory_size   = 256

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

resource "aws_lambda_event_source_mapping" "analyst_sqs" {
  event_source_arn = aws_sqs_queue.analyst.arn
  function_name    = aws_lambda_function.analyst.arn
  batch_size       = 1
}

resource "aws_lambda_function" "narrator" {
  function_name = "${var.app_name}-narrator"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 120
  memory_size   = 256

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

resource "aws_lambda_function" "deckgen" {
  function_name = "${var.app_name}-deckgen"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 60
  memory_size   = 128

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

resource "aws_lambda_function" "notifier" {
  function_name = "${var.app_name}-notifier"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  timeout       = 60
  memory_size   = 128

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment { variables = local.lambda_env }

  lifecycle { ignore_changes = [filename, source_code_hash] }

  tags = var.tags
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "api_function_url"        { value = aws_lambda_function_url.api.function_url }
output "api_lambda_arn"          { value = aws_lambda_function.api.arn }
output "orchestrator_lambda_arn" { value = aws_lambda_function.orchestrator.arn }
output "analyst_lambda_arn"      { value = aws_lambda_function.analyst.arn }
output "narrator_lambda_arn"     { value = aws_lambda_function.narrator.arn }
output "deckgen_lambda_arn"      { value = aws_lambda_function.deckgen.arn }
output "notifier_lambda_arn"     { value = aws_lambda_function.notifier.arn }
output "sqs_analyst_queue_url"   { value = aws_sqs_queue.analyst.url }
output "event_bus_name"          { value = aws_cloudwatch_event_bus.main.name }
