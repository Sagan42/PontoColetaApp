module "stack" {
  source = "../../modules/stack"

  environment = "prod"
  aws_region  = var.aws_region

  log_level          = "info"
  log_retention_days = 30

  geocoding_user_agent = var.geocoding_user_agent

  point_in_time_recovery_enabled = true
  deletion_protection_enabled    = true

  # 10 rps is 25,920,000 requests a month, already two orders of magnitude above
  # plausible use for a single city. See docs/terraform.md for the arithmetic.
  api_throttling_rate_limit  = 10
  api_throttling_burst_limit = 30

  admin_mfa_configuration = "ON"

  public_lambda_reserved_concurrency = 20
  admin_lambda_reserved_concurrency  = 2

  monthly_budget_usd = 25
  cost_alert_email   = var.cost_alert_email
}
