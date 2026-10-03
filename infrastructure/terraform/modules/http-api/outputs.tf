output "api_id" {
  description = "Identifier of the HTTP API."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Base URL of the API. This is the value the mobile app points to."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "access_log_group_name" {
  description = "Log group holding one line per HTTP request."
  value       = aws_cloudwatch_log_group.access.name
}
