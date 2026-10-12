variable "name_prefix" {
  description = "Prefix used to name the topic, the budget and every alarm."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget in USD for the whole environment."
  type        = number
}

variable "notification_email" {
  description = "Address that receives the budget notifications and the alarms. No default on purpose: an alert nobody reads is not an alert."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.notification_email))
    error_message = "notification_email must be a single valid e-mail address."
  }
}

variable "api_id" {
  description = "Identifier of the HTTP API, the ApiId dimension of its CloudWatch metrics."
  type        = string
}

variable "api_throttling_rate_limit" {
  description = "Requests per second the stage accepts. The request-count alarm is derived from it."
  type        = number
}

variable "public_lambda_function_name" {
  description = "Public function whose concurrency is watched."
  type        = string
}

variable "public_lambda_reserved_concurrency" {
  description = "Concurrency ceiling of the public function. -1 means unreserved, and the alarm then falls back to a fixed threshold."
  type        = number
}

variable "table_name" {
  description = "DynamoDB table whose consumed read capacity is watched."
  type        = string
}

variable "table_max_read_request_units" {
  description = "Read ceiling of the table. The read-capacity alarm is derived from it."
  type        = number
}

variable "tags" {
  description = "Tags applied to the topic, the budget and the alarms."
  type        = map(string)
  default     = {}
}
