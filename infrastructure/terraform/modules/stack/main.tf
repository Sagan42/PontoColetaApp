locals {
  name_prefix = "${var.project_name}-${var.environment}"

  tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  })

  artifacts_dir = "${path.root}/../../../../backend/dist/lambdas"

  common_environment_variables = {
    ENVIRONMENT          = var.environment
    TABLE_NAME           = module.dynamodb.table_name
    LOG_LEVEL            = var.log_level
    GEOCODING_PROVIDER   = "nominatim"
    GEOCODING_BASE_URL   = var.geocoding_base_url
    GEOCODING_USER_AGENT = var.geocoding_user_agent
    GEOCODING_TIMEOUT_MS = tostring(var.geocoding_timeout_ms)
  }
}

module "dynamodb" {
  source = "../dynamodb"

  table_name                     = local.name_prefix
  point_in_time_recovery_enabled = var.point_in_time_recovery_enabled
  deletion_protection_enabled    = var.deletion_protection_enabled

  # The indexes carry the same ceiling as the table: a nearby search reads
  # GSI2-geo nine times, so the index is where read amplification lands.
  max_read_request_units        = var.table_max_read_request_units
  max_write_request_units       = var.table_max_write_request_units
  index_max_read_request_units  = var.table_max_read_request_units
  index_max_write_request_units = var.table_max_write_request_units

  tags = local.tags
}

module "admin_auth" {
  source = "../admin-auth"

  user_pool_name    = "${local.name_prefix}-admin"
  mfa_configuration = var.admin_mfa_configuration
  aws_region        = var.aws_region
  tags              = local.tags
}

module "public_lambda" {
  source = "../lambda"

  function_name         = "${local.name_prefix}-public-api"
  source_dir            = "${local.artifacts_dir}/public-api"
  memory_size           = var.public_lambda_memory_size
  timeout_seconds       = var.public_lambda_timeout_seconds
  reserved_concurrency  = var.public_lambda_reserved_concurrency
  log_retention_days    = var.log_retention_days
  environment_variables = local.common_environment_variables

  dynamodb_actions = [
    "dynamodb:GetItem",
    "dynamodb:BatchGetItem",
    "dynamodb:Query",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
  ]

  dynamodb_resources = concat([module.dynamodb.table_arn], module.dynamodb.index_arns)

  tags = local.tags
}

module "admin_lambda" {
  source = "../lambda"

  function_name         = "${local.name_prefix}-admin-api"
  source_dir            = "${local.artifacts_dir}/admin-api"
  memory_size           = var.admin_lambda_memory_size
  timeout_seconds       = var.admin_lambda_timeout_seconds
  reserved_concurrency  = var.admin_lambda_reserved_concurrency
  log_retention_days    = var.log_retention_days
  environment_variables = local.common_environment_variables

  # Query reads the metrics; GetItem and TransactWriteItems are what taking a
  # point off the air needs — read it, then rewrite it with its material links.
  # No PutItem or DeleteItem: the administrative API never creates or destroys.
  dynamodb_actions = [
    "dynamodb:Query",
    "dynamodb:GetItem",
    "dynamodb:TransactWriteItems",
  ]

  dynamodb_resources = [module.dynamodb.table_arn]

  tags = local.tags
}

module "http_api" {
  source = "../http-api"

  api_name    = local.name_prefix
  environment = var.environment

  public_lambda_invoke_arn    = module.public_lambda.invoke_arn
  public_lambda_function_name = module.public_lambda.function_name
  admin_lambda_invoke_arn     = module.admin_lambda.invoke_arn
  admin_lambda_function_name  = module.admin_lambda.function_name

  admin_jwt_issuer   = module.admin_auth.issuer
  admin_jwt_audience = module.admin_auth.client_id

  throttling_rate_limit  = var.api_throttling_rate_limit
  throttling_burst_limit = var.api_throttling_burst_limit
  log_retention_days     = var.log_retention_days

  tags = local.tags
}

# Every ceiling above is a limit; this is what tells someone it was reached.
module "cost_guardrails" {
  source = "../cost-guardrails"

  name_prefix        = local.name_prefix
  monthly_budget_usd = var.monthly_budget_usd
  notification_email = var.cost_alert_email

  api_id                    = module.http_api.api_id
  api_throttling_rate_limit = var.api_throttling_rate_limit

  public_lambda_function_name        = module.public_lambda.function_name
  public_lambda_reserved_concurrency = var.public_lambda_reserved_concurrency

  table_name                   = module.dynamodb.table_name
  table_max_read_request_units = var.table_max_read_request_units

  tags = local.tags
}
