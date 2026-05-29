variable "domain_name" {}
variable "tags"        { type = map(string) }

# ACM certificate — must be in us-east-1 for CloudFront
resource "aws_acm_certificate" "frontend" {
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"
  tags                      = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Route53 hosted zone — created here, nameservers go to your registrar
resource "aws_route53_zone" "main" {
  name = var.domain_name
  tags = var.tags
}

# DNS validation records for ACM
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "frontend" {
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# A alias records (apex + www) → CloudFront live in modules/edge/cloudfront to avoid a
# module-level cycle: cloudfront needs the validated cert ARN from route53; if route53
# also needed the CloudFront domain name, the two modules would depend on each other.

output "acm_certificate_arn"   { value = aws_acm_certificate_validation.frontend.certificate_arn }
output "route53_zone_id"       { value = aws_route53_zone.main.zone_id }
output "route53_name_servers"  { value = aws_route53_zone.main.name_servers }
