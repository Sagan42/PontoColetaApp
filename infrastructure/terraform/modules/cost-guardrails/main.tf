locals {
  # Five minutes: long enough that a single burst does not page anybody, short
  # enough to catch sustained abuse while it is still cheap.
  period_seconds = 300

  # Half the throttle ceiling, held for the whole period. Plausible use for one
  # city sits orders of magnitude below this, so the alarm means "something is
  # hammering the API", not "busy afternoon".
  api_count_threshold = var.api_throttling_rate_limit * local.period_seconds / 2

  # ConcurrentExecutions is bounded by the reservation, so the ceiling for this
  # metric is the reservation itself. Unreserved (-1) has no ceiling to derive
  # from, so fall back to what the throttle alone could drive.
  concurrency_threshold = (
    var.public_lambda_reserved_concurrency > 0
    ? ceil(var.public_lambda_reserved_concurrency * 0.8)
    : var.api_throttling_rate_limit
  )

  # Consumed units are reported as a Sum over the period, so the ceiling for the
  # window is the per-second ceiling times the window.
  read_units_threshold = var.table_max_read_request_units * local.period_seconds / 2
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-cost-alerts"
  tags = var.tags
}

# The subscription is created pending: AWS sends a confirmation link and the
# address only starts receiving once someone clicks it.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# Budgets talk to the address directly rather than through the topic: an SNS
# target would need a topic policy granting budgets.amazonaws.com publish
# rights, which is more moving parts for the same e-mail.
resource "aws_budgets_budget" "monthly" {
  name              = "${var.name_prefix}-monthly"
  budget_type       = "COST"
  limit_amount      = tostring(var.monthly_budget_usd)
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  dynamic "notification" {
    for_each = [50, 80, 100]

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.notification_email]
    }
  }

  # Forecast at 100 percent is the one that arrives early enough to act on.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.notification_email]
  }
}

resource "aws_cloudwatch_metric_alarm" "api_requests" {
  alarm_name        = "${var.name_prefix}-api-request-flood"
  alarm_description = "HTTP API served more than ${local.api_count_threshold} requests in ${local.period_seconds}s, about half the throttle ceiling held for the whole window."

  namespace   = "AWS/ApiGateway"
  metric_name = "Count"
  dimensions  = { ApiId = var.api_id }

  statistic           = "Sum"
  period              = local.period_seconds
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = local.api_count_threshold

  # No data means no traffic, which is not a problem worth an e-mail.
  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "public_lambda_concurrency" {
  alarm_name        = "${var.name_prefix}-public-lambda-concurrency"
  alarm_description = "Public function held more than ${local.concurrency_threshold} concurrent executions, close to its reservation. Past the reservation, requests are rejected."

  namespace   = "AWS/Lambda"
  metric_name = "ConcurrentExecutions"
  dimensions  = { FunctionName = var.public_lambda_function_name }

  statistic           = "Maximum"
  period              = local.period_seconds
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = local.concurrency_threshold

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "table_read_capacity" {
  alarm_name        = "${var.name_prefix}-table-read-capacity"
  alarm_description = "Table consumed more than ${local.read_units_threshold} read units in ${local.period_seconds}s. A nearby search reads the geo index nine times, so this is the metric that moves first under a read loop."

  namespace   = "AWS/DynamoDB"
  metric_name = "ConsumedReadCapacityUnits"
  dimensions  = { TableName = var.table_name }

  statistic           = "Sum"
  period              = local.period_seconds
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = local.read_units_threshold

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]

  tags = var.tags
}
