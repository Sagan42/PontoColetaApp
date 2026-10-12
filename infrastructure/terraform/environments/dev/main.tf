module "stack" {
  source = "../../modules/stack"

  environment = "dev"
  aws_region  = var.aws_region

  log_level          = "debug"
  log_retention_days = 7

  geocoding_user_agent = var.geocoding_user_agent

  point_in_time_recovery_enabled = false
  deletion_protection_enabled    = false

  api_throttling_rate_limit  = 10
  api_throttling_burst_limit = 20

  admin_mfa_configuration = "OPTIONAL"

  # Lower than prod on purpose. dev is for one person at a time, and a runaway
  # loop here should hit a wall long before it shows up on the bill.
  public_lambda_reserved_concurrency = 5
  admin_lambda_reserved_concurrency  = 1
}
