variable "frontend_bucket_name" {}
variable "tags"                 { type = map(string) }

# ── Frontend bucket ───────────────────────────────────────────────────────────
# Bucket policy (allowing CloudFront OAC to read) lives in modules/edge/cloudfront —
# it needs the distribution ARN, which is only known after the distribution is created.
# This breaks the circular dependency: s3 → cloudfront → s3.

resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "frontend_bucket_name"            { value = aws_s3_bucket.frontend.id }
output "frontend_bucket_arn"             { value = aws_s3_bucket.frontend.arn }
output "frontend_bucket_regional_domain" { value = aws_s3_bucket.frontend.bucket_regional_domain_name }
