module "stack" {
  source = "../../modules/stack"

  environment = "dev"
  aws_region  = var.aws_region

  log_level          = "debug"
  log_retention_days = 7

  geocoding_user_agent = var.geocoding_user_agent
  geocoding_provider   = var.geocoding_provider
  geocoding_api_key    = var.geocoding_api_key

  point_in_time_recovery_enabled = false
  deletion_protection_enabled    = false

  api_throttling_rate_limit  = 5
  api_throttling_burst_limit = 10

  admin_mfa_configuration = "OPTIONAL"

  # TEMPORARIO: a conta e nova e seu limite de concorrencia e 5. A AWS exige
  # deixar 5 nao reservados, entao reservar qualquer valor falha com
  # InvalidParameterValueException. Enquanto isso, o proprio limite da conta e o
  # teto -- bem mais apertado que a reserva. Depois do aumento de cota para
  # 1000, volte para 5 e 1.
  public_lambda_reserved_concurrency = -1
  admin_lambda_reserved_concurrency  = -1

  table_max_read_request_units  = 100
  table_max_write_request_units = 10

  monthly_budget_usd = 5
  cost_alert_email   = var.cost_alert_email
}
