module "stack" {
  source = "../../modules/stack"

  environment = "dev"
  aws_region  = var.aws_region

  log_level          = "debug"
  log_retention_days = 7

  geocoding_user_agent = var.geocoding_user_agent

  point_in_time_recovery_enabled = false
  deletion_protection_enabled    = false

  api_throttling_rate_limit  = 5
  api_throttling_burst_limit = 10

  admin_mfa_configuration = "OPTIONAL"

  # Lower than prod on purpose. dev is for one person at a time, and a runaway
  # loop here should hit a wall long before it shows up on the bill.
  public_lambda_reserved_concurrency = 5
  admin_lambda_reserved_concurrency  = 1

  table_max_read_request_units  = 100
  table_max_write_request_units = 10

  monthly_budget_usd = 5
  cost_alert_email   = var.cost_alert_email
}
