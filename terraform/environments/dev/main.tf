terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Backend values supplied at `terraform init` time via -backend-config flags.
  # Do not hardcode account IDs in committed files.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  # Relies on AWS_PROFILE env var set in CI via OIDC, or locally via --profile flag.
}

# Used to auto-derive bucket names from account ID
data "aws_caller_identity" "current" {}

locals {
  app_name = "daemon-code"

  common_tags = {
    app = "daemon-code"
    env = var.environment
  }
}

# ── Module calls ──────────────────────────────────────────────────────────────

module "data" {
  source      = "../../modules/data"
  app_name    = local.app_name
  environment = var.environment
  tags        = local.common_tags
}

module "compute" {
  source                = "../../modules/compute"
  app_name              = local.app_name
  environment           = var.environment
  aws_region            = var.aws_region
  db_secret_arn         = module.data.db_secret_arn
  jwt_secret_arn        = module.data.jwt_secret_arn
  anthropic_secret_arn  = module.data.anthropic_secret_arn
  vapid_secret_arn      = module.data.vapid_secret_arn
  audio_bucket_name     = module.data.audio_bucket_name
  audio_bucket_arn      = module.data.audio_bucket_arn
  static_domain         = var.domain_name
  dynamo_table_decks    = module.data.dynamo_table_decks_name
  dynamo_table_state    = module.data.dynamo_table_state_name
  dynamo_table_decks_arn = module.data.dynamo_table_decks_arn
  dynamo_table_state_arn = module.data.dynamo_table_state_arn
  tags                  = local.common_tags
}

module "iam" {
  source         = "../../modules/security/iam"
  github_repo    = var.github_repo
  environment    = var.environment
  aws_region     = var.aws_region
  tags           = local.common_tags
}

module "cloudwatch" {
  source      = "../../modules/observability/cloudwatch"
  environment = var.environment
  tags        = local.common_tags
}
