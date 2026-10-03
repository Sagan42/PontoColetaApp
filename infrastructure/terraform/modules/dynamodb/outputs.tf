output "table_name" {
  description = "Name of the table, injected into the Lambdas as TABLE_NAME."
  value       = aws_dynamodb_table.main.name
}

output "table_arn" {
  description = "ARN of the table, used to scope IAM policies."
  value       = aws_dynamodb_table.main.arn
}

output "index_arns" {
  description = "ARNs of every index, required by IAM policies that allow Query."
  value       = ["${aws_dynamodb_table.main.arn}/index/*"]
}
