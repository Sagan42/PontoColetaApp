module "stack" {
  source = "../../modules/stack"

  environment = "prod"
  aws_region  = var.aws_region

  log_level          = "info"
  log_retention_days = 30

  geocoding_user_agent = var.geocoding_user_agent

  point_in_time_recovery_enabled = true
  deletion_protection_enabled    = true

  api_throttling_rate_limit  = 50
  api_throttling_burst_limit = 100

  admin_mfa_configuration = "ON"

  public_lambda_reserved_concurrency = 20
  admin_lambda_reserved_concurrency  = 2
}
