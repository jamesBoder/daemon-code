variable "environment" {}
variable "tags"        { type = map(string) }

# Log groups for Phase 0 — Lambda groups added in Phase 2
resource "aws_cloudwatch_log_group" "cloudfront_access" {
  name              = "/daemon-code/${var.environment}/cloudfront/access"
  retention_in_days = 14
  tags              = var.tags
}
