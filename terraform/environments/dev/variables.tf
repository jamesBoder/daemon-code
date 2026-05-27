variable "aws_region" {
  default = "us-east-1"
}

variable "environment" {
  default = "dev"
}

variable "domain_name" {
  description = "Primary domain for the frontend (e.g. daemoncode.app)"
  type        = string
}

variable "backend_url" {
  description = "Lambda Function URL for the API (filled in Phase 2)"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repo in owner/name format"
  default     = "jamesboder/daemon-code"
}
