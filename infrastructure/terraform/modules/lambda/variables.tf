variable "function_name" {
  description = "Full name of the Lambda function, including the environment suffix."
  type        = string
}

variable "source_dir" {
  description = "Directory produced by `npm run build` in backend/, zipped by Terraform."
  type        = string
}

variable "environment_variables" {
  description = "Environment variables injected into the function."
  type        = map(string)
  default     = {}
}

variable "memory_size" {
  description = "Memory in MB. CPU scales with memory, so this also sets cold start speed."
  type        = number
  default     = 512

  validation {
    condition     = var.memory_size >= 128 && var.memory_size <= 3008
    error_message = "memory_size must be between 128 and 3008 MB."
  }
}

variable "timeout_seconds" {
  description = "Maximum execution time. Keep it just above the slowest dependency."
  type        = number
  default     = 10
}

variable "reserved_concurrency" {
  description = "Maximum concurrent executions. -1 leaves the function unreserved."
  type        = number
  default     = -1
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention. Logs are the main recurring cost of observability."
  type        = number
  default     = 14
}

variable "dynamodb_actions" {
  description = "DynamoDB actions this function is allowed to perform."
  type        = list(string)
  default     = []
}

variable "dynamodb_resources" {
  description = "ARNs (table and indexes) the DynamoDB actions apply to."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource of the module."
  type        = map(string)
  default     = {}
}
