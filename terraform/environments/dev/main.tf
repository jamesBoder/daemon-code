terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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
  frontend_bucket_name = "daemon-code-frontend-${data.aws_caller_identity.current.account_id}"
  audio_bucket_name    = "daemon-code-audio-${data.aws_caller_identity.current.account_id}"

  common_tags = {
    app = "daemon-code"
    env = var.environment
  }
}

# ── Module calls ──────────────────────────────────────────────────────────────

module "s3" {
  source               = "../../modules/edge/s3"
  frontend_bucket_name = local.frontend_bucket_name
  audio_bucket_name    = local.audio_bucket_name
  cloudfront_arn       = module.cloudfront.distribution_arn
  tags                 = local.common_tags
}

module "cloudfront" {
  source               = "../../modules/edge/cloudfront"
  frontend_bucket_name = local.frontend_bucket_name
  frontend_bucket_domain = module.s3.frontend_bucket_regional_domain
  domain_name          = var.domain_name
  acm_certificate_arn  = module.route53.acm_certificate_arn
  backend_url          = var.backend_url
  tags                 = local.common_tags
}

module "route53" {
  source                   = "../../modules/edge/route53"
  domain_name              = var.domain_name
  cloudfront_domain_name   = module.cloudfront.domain_name
  cloudfront_hosted_zone_id = module.cloudfront.hosted_zone_id
  tags                     = local.common_tags
}

module "iam" {
  source         = "../../modules/security/iam"
  github_repo    = var.github_repo
  environment    = var.environment
  tags           = local.common_tags
}

module "cloudwatch" {
  source      = "../../modules/observability/cloudwatch"
  environment = var.environment
  tags        = local.common_tags
}
