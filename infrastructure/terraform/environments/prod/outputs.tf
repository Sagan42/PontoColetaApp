output "api_endpoint" {
  description = "Base URL of the production API."
  value       = module.stack.api_endpoint
}

output "table_name" {
  description = "DynamoDB table of production."
  value       = module.stack.table_name
}

output "admin_user_pool_id" {
  description = "User pool where the production administrator must be created."
  value       = module.stack.admin_user_pool_id
}

output "admin_client_id" {
  description = "App client id used by the administrative screen."
  value       = module.stack.admin_client_id
}

output "log_groups" {
  description = "Log groups of this environment."
  value       = module.stack.log_groups
}
