output "cloudfront_distribution_id" {
  value = module.cloudfront.distribution_id
}

output "cloudfront_domain" {
  value = module.cloudfront.domain_name
}

output "frontend_bucket_name" {
  value = module.s3.frontend_bucket_name
}

output "github_actions_role_arn" {
  value = module.iam.github_actions_role_arn
}

output "route53_name_servers" {
  value = module.route53.route53_name_servers
}

output "route53_zone_id" {
  value = module.route53.route53_zone_id
}
