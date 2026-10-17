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

  admin_mfa_configuration = "OPTIONAL"

  # TEMPORARIO, mesma razao de dev: o limite de concorrencia da conta e 5.
  # 20 + 2 exigiria limite de pelo menos 27. Pedir o aumento de cota para 1000
  # e pre-requisito de prod; feito isso, volte para 20 e 2.
  public_lambda_reserved_concurrency = -1
  admin_lambda_reserved_concurrency  = -1

  monthly_budget_usd = 25
  cost_alert_email   = var.cost_alert_email
}
