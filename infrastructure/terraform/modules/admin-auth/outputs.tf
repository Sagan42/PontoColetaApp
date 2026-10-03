output "user_pool_id" {
  description = "Identifier of the user pool."
  value       = aws_cognito_user_pool.admin.id
}

output "client_id" {
  description = "App client id used by the mobile app and accepted as the token audience."
  value       = aws_cognito_user_pool_client.admin_app.id
}

output "issuer" {
  description = "Issuer URL configured in the API Gateway JWT authorizer."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.admin.id}"
}
