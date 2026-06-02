variable "frontend_bucket_name"   {}
variable "frontend_bucket_arn"    {}
variable "frontend_bucket_domain" {}
variable "audio_bucket_name"      {}
variable "audio_bucket_arn"       {}
variable "domain_name"            {}
variable "acm_certificate_arn"    {}
variable "route53_zone_id"        {}   # alias records live here to avoid cloudfront ↔ route53 cycle
variable "backend_url"            { default = "" }
variable "tags"                   { type = map(string) }

# OAC — signs every S3 request with SigV4
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "daemon-code-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "daemon-code-security-headers"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' ${var.backend_url}; media-src 'self' https://static.daemoncode.app;"
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name, "www.${var.domain_name}"]

  origin {
    domain_name              = var.frontend_bucket_domain
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "s3-frontend"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true   # enables Brotli + gzip

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 31536000
  }

  # SPA routing — S3 returns 403 for missing paths (private bucket), not 404
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = var.tags
}

# ── S3 bucket policies ────────────────────────────────────────────────────────
# Policies live here (not in modules/edge/s3) because they need the distribution ARN,
# which is only available after this resource is created. Putting policies in the s3
# module would create a circular dependency: s3 → cloudfront → s3.

resource "aws_s3_bucket_policy" "frontend" {
  bucket = var.frontend_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.frontend_bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

resource "aws_s3_bucket_policy" "audio" {
  bucket = var.audio_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.audio_bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

# ── Route53 alias records ─────────────────────────────────────────────────────
# Alias records live here (not in modules/edge/route53) because they need the
# CloudFront domain name, which is only available after the distribution is created.
# Moving them here breaks the module-level cycle: route53 → cloudfront → route53.

resource "aws_route53_record" "apex" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

output "distribution_id"   { value = aws_cloudfront_distribution.frontend.id }
output "distribution_arn"  { value = aws_cloudfront_distribution.frontend.arn }
output "domain_name"       { value = aws_cloudfront_distribution.frontend.domain_name }
output "hosted_zone_id"    { value = aws_cloudfront_distribution.frontend.hosted_zone_id }
