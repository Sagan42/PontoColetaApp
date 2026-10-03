output "api_endpoint" {
  description = "Base URL of the API. Set it as EXPO_PUBLIC_API_URL in the mobile app."
  value       = module.http_api.api_endpoint
}

output "table_name" {
  description = "Name of the DynamoDB table of this environment."
  value       = module.dynamodb.table_name
}

output "admin_user_pool_id" {
  description = "User pool where the administrative account must be created."
  value       = module.admin_auth.user_pool_id
}

output "admin_client_id" {
  description = "App client id used by the administrative screen to sign in."
  value       = module.admin_auth.client_id
}

output "log_groups" {
  description = "Log groups to inspect when diagnosing a problem."
  value = {
    public_api = module.public_lambda.log_group_name
    admin_api  = module.admin_lambda.log_group_name
    http_api   = module.http_api.access_log_group_name
  }
}

output "lambda_package_sizes_bytes" {
  description = "Size of each deployment package, to keep an eye on bundle growth."
  value = {
    public_api = module.public_lambda.package_size_bytes
    admin_api  = module.admin_lambda.package_size_bytes
  }
}
