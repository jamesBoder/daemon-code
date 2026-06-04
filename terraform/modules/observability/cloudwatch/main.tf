variable "environment" {}
variable "app_name"   {}
variable "aws_region" {}
variable "tags"        { type = map(string) }

# Log groups for Phase 0 — Lambda groups added in Phase 2
resource "aws_cloudwatch_log_group" "cloudfront_access" {
  name              = "/daemon-code/${var.environment}/cloudfront/access"
  retention_in_days = 14
  tags              = var.tags
}

# ── Pipeline health dashboard ─────────────────────────────────────────────────

locals {
  pipeline_fns = [
    "${var.app_name}-orchestrator",
    "${var.app_name}-analyst",
    "${var.app_name}-narrator",
    "${var.app_name}-deckgen",
    "${var.app_name}-notifier",
  ]
}

resource "aws_cloudwatch_dashboard" "pipeline" {
  dashboard_name = "${var.app_name}-pipeline"

  dashboard_body = jsonencode({
    widgets = [
      # ── Row 1: latency ──────────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Analyst duration p99 (target < 30s)"
          region = var.aws_region
          view   = "timeSeries"
          period = 300
          stat   = "p99"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "${var.app_name}-analyst"]
          ]
          annotations = {
            horizontal = [{ value = 30000, label = "30s SLO", color = "#ff6961" }]
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Narrator duration p99 (target < 10s)"
          region = var.aws_region
          view   = "timeSeries"
          period = 300
          stat   = "p99"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "${var.app_name}-narrator"]
          ]
          annotations = {
            horizontal = [{ value = 10000, label = "10s SLO", color = "#ff6961" }]
          }
        }
      },
      # ── Row 2: errors ───────────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Pipeline Lambda errors (target = 0)"
          region = var.aws_region
          view   = "timeSeries"
          stacked = true
          period = 300
          metrics = [
            for fn in local.pipeline_fns :
            ["AWS/Lambda", "Errors", "FunctionName", fn, { stat = "Sum", label = fn }]
          ]
          annotations = {
            horizontal = [{ value = 0, label = "0 errors", color = "#2ca02c" }]
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Pipeline Lambda invocations"
          region = var.aws_region
          view   = "timeSeries"
          stacked = true
          period = 300
          metrics = [
            for fn in local.pipeline_fns :
            ["AWS/Lambda", "Invocations", "FunctionName", fn, { stat = "Sum", label = fn }]
          ]
        }
      },
      # ── Row 3: compile success rate ─────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Compile success rate % (target > 99%)"
          region = var.aws_region
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/Lambda", "Errors",      "FunctionName", "${var.app_name}-analyst",  { id = "e1", visible = false, stat = "Sum" }],
            ["AWS/Lambda", "Invocations", "FunctionName", "${var.app_name}-analyst",  { id = "i1", visible = false, stat = "Sum" }],
            ["AWS/Lambda", "Errors",      "FunctionName", "${var.app_name}-narrator", { id = "e2", visible = false, stat = "Sum" }],
            ["AWS/Lambda", "Invocations", "FunctionName", "${var.app_name}-narrator", { id = "i2", visible = false, stat = "Sum" }],
            ["AWS/Lambda", "Errors",      "FunctionName", "${var.app_name}-deckgen",  { id = "e3", visible = false, stat = "Sum" }],
            ["AWS/Lambda", "Invocations", "FunctionName", "${var.app_name}-deckgen",  { id = "i3", visible = false, stat = "Sum" }],
            [{ expression = "(1 - (e1+e2+e3) / (i1+i2+i3)) * 100", label = "Success %", id = "success_rate" }]
          ]
          annotations = {
            horizontal = [{ value = 99, label = "99% SLO", color = "#ff6961" }]
          }
          yAxis = { left = { min = 0, max = 100 } }
        }
      },
      # ── Row 3 right: DeckGen errors (must be 0) ────────────────────────────
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "DeckGen errors (target = 0)"
          region = var.aws_region
          view   = "timeSeries"
          period = 300
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", "${var.app_name}-deckgen", { stat = "Sum" }]
          ]
          annotations = {
            horizontal = [{ value = 0, label = "0 errors", color = "#2ca02c" }]
          }
        }
      },
    ]
  })
}
