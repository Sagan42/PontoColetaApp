output "function_name" {
  description = "Name of the created function."
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "ARN of the function."
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "ARN used by API Gateway to invoke the function."
  value       = aws_lambda_function.this.invoke_arn
}

output "log_group_name" {
  description = "Log group to query in CloudWatch Logs Insights."
  value       = aws_cloudwatch_log_group.lambda.name
}

output "role_arn" {
  description = "Execution role of the function."
  value       = aws_iam_role.lambda.arn
}

output "package_size_bytes" {
  description = "Size of the deployment package, useful to spot bundle growth."
  value       = data.archive_file.package.output_size
}
