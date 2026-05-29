# Phase 2 outputs — available immediately (no CloudFront dependency)
output "api_function_url" {
  value = module.compute.api_function_url
}

output "db_endpoint" {
  value = module.data.db_endpoint
}

output "db_secret_arn" {
  value = module.data.db_secret_arn
}

output "jwt_secret_arn" {
  value = module.data.jwt_secret_arn
}

output "anthropic_secret_arn" {
  value = module.data.anthropic_secret_arn
}

output "vapid_secret_arn" {
  value = module.data.vapid_secret_arn
}

output "sqs_analyst_queue_url" {
  value = module.compute.sqs_analyst_queue_url
}

output "event_bus_name" {
  value = module.compute.event_bus_name
}

output "audio_bucket_name" {
  value = module.data.audio_bucket_name
}

output "github_actions_role_arn" {
  value = module.iam.github_actions_role_arn
}

# Phase 0 outputs — available once CloudFront account verification resolves
output "cloudfront_distribution_id" {
  value = module.cloudfront.distribution_id
}

output "cloudfront_domain" {
  value = module.cloudfront.domain_name
}

output "frontend_bucket_name" {
  value = module.s3.frontend_bucket_name
}

output "route53_name_servers" {
  value = module.route53.route53_name_servers
}

output "route53_zone_id" {
  value = module.route53.route53_zone_id
}
