output "api_gateway_url" {
  value = module.compute.api_gateway_url
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
