variable "app_name"    {}
variable "environment" {}
variable "tags"        { type = map(string) }

data "aws_caller_identity" "current" {}

# ── DynamoDB ──────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "shadow_state" {
  name         = "${var.app_name}-shadow-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "date"

  attribute {
    name = "user_id"
    type = "S"
  }
  attribute {
    name = "date"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "daily_decks" {
  name         = "${var.app_name}-daily-decks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "date"

  attribute {
    name = "user_id"
    type = "S"
  }
  attribute {
    name = "date"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.tags
}

# ── S3 — audio bucket (Polly MP3s) ────────────────────────────────────────────
# CloudFront read-access bucket policy is added in modules/edge/cloudfront once
# account verification resolves. Lambda writes via its IAM role — no bucket policy needed.

resource "aws_s3_bucket" "audio" {
  bucket = "${var.app_name}-audio-${data.aws_caller_identity.current.account_id}"
  tags   = var.tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "audio" {
  bucket                  = aws_s3_bucket.audio.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# ── RDS PostgreSQL ─────────────────────────────────────────────────────────────

resource "random_password" "db" {
  length  = 32
  special = false
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.app_name}-rds-${var.environment}"
  description = "RDS PostgreSQL access"
  vpc_id      = data.aws_vpc.default.id
  tags        = var.tags

  # Dev: allow from anywhere — Lambda functions outside VPC connect via public endpoint.
  # Post-MVP: move Lambda into VPC + restrict to Lambda SG.
  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids
  tags       = var.tags
}

resource "aws_db_instance" "main" {
  identifier        = "${var.app_name}-${var.environment}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "daemoncode"
  username = "daemoncode"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = true   # dev only — Lambda outside VPC reaches via public endpoint

  backup_retention_period = 7
  deletion_protection     = false
  skip_final_snapshot     = true

  tags = var.tags
}

# ── Secrets Manager ────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "db" {
  name = "${var.app_name}-db-${var.environment}"
  tags = var.tags
}

# Populated automatically with RDS credentials — matches dbSecret struct in config.go.
resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
    username = aws_db_instance.main.username
    password = random_password.db.result
  })
}

# jwt, anthropic, vapid — values set manually via console or CLI after apply.
# JWT: a random 64-char hex string. Anthropic: the API key. VAPID: {"public_key":"...","private_key":"..."}.
resource "aws_secretsmanager_secret" "jwt" {
  name = "${var.app_name}-jwt-${var.environment}"
  tags = var.tags
}

resource "aws_secretsmanager_secret" "anthropic" {
  name = "${var.app_name}-anthropic-${var.environment}"
  tags = var.tags
}

resource "aws_secretsmanager_secret" "vapid" {
  name = "${var.app_name}-vapid-${var.environment}"
  tags = var.tags
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "db_endpoint"            { value = aws_db_instance.main.endpoint }
output "db_identifier"          { value = aws_db_instance.main.identifier }
output "db_secret_arn"          { value = aws_secretsmanager_secret.db.arn }
output "jwt_secret_arn"         { value = aws_secretsmanager_secret.jwt.arn }
output "anthropic_secret_arn"   { value = aws_secretsmanager_secret.anthropic.arn }
output "vapid_secret_arn"       { value = aws_secretsmanager_secret.vapid.arn }
output "dynamo_table_decks_name"{ value = aws_dynamodb_table.daily_decks.name }
output "dynamo_table_state_name"{ value = aws_dynamodb_table.shadow_state.name }
output "dynamo_table_decks_arn" { value = aws_dynamodb_table.daily_decks.arn }
output "dynamo_table_state_arn" { value = aws_dynamodb_table.shadow_state.arn }
output "audio_bucket_name"      { value = aws_s3_bucket.audio.id }
output "audio_bucket_arn"       { value = aws_s3_bucket.audio.arn }
