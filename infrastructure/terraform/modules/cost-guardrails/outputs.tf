output "alerts_topic_arn" {
  description = "Topic the alarms publish to. Subscribe anything else that should hear about abuse."
  value       = aws_sns_topic.alerts.arn
}

output "alarm_names" {
  description = "Alarms created, to look up in the CloudWatch console."
  value = [
    aws_cloudwatch_metric_alarm.api_requests.alarm_name,
    aws_cloudwatch_metric_alarm.public_lambda_concurrency.alarm_name,
    aws_cloudwatch_metric_alarm.table_read_capacity.alarm_name,
  ]
}

output "alarm_thresholds" {
  description = "Threshold of each alarm, derived from the ceilings this environment sets."
  value = {
    api_requests_per_period = aws_cloudwatch_metric_alarm.api_requests.threshold
    lambda_concurrency      = aws_cloudwatch_metric_alarm.public_lambda_concurrency.threshold
    table_read_units        = aws_cloudwatch_metric_alarm.table_read_capacity.threshold
  }
}

output "monthly_budget_usd" {
  description = "Budget this environment is held to."
  value       = aws_budgets_budget.monthly.limit_amount
}
