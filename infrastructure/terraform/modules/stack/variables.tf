variable "project_name" {
  description = "Prefix used to name every resource."
  type        = string
  default     = "pontocoleta"
}

variable "environment" {
  description = "Environment name. Part of every resource name, so dev and prod never collide."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "aws_region" {
  description = "Region where the stack is deployed."
  type        = string
}

variable "log_level" {
  description = "Minimum level written by the Lambdas: debug, info, warn or error."
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "Retention of every log group of the stack."
  type        = number
  default     = 14
}

variable "geocoding_base_url" {
  description = "Base URL of the geocoding provider."
  type        = string
  default     = "https://nominatim.openstreetmap.org"
}

variable "geocoding_user_agent" {
  description = "User-Agent sent to the geocoding provider, as its usage policy requires."
  type        = string
}

variable "geocoding_timeout_ms" {
  description = "How long the backend waits for the geocoding provider."
  type        = number
  default     = 4000
}

variable "public_lambda_memory_size" {
  description = "Memory of the public API function."
  type        = number
  default     = 512
}

variable "public_lambda_timeout_seconds" {
  description = "Timeout of the public API function. It must exceed the geocoding timeout."
  type        = number
  default     = 15
}

variable "public_lambda_reserved_concurrency" {
  description = "Concurrency ceiling of the public API function."
  type        = number
  default     = -1
}

variable "admin_lambda_memory_size" {
  description = "Memory of the administrative function."
  type        = number
  default     = 256
}

variable "admin_lambda_timeout_seconds" {
  description = "Timeout of the administrative function."
  type        = number
  default     = 10
}

variable "admin_lambda_reserved_concurrency" {
  description = "Concurrency ceiling of the administrative function."
  type        = number
  default     = -1
}

variable "api_throttling_rate_limit" {
  description = "Steady-state requests per second accepted by the API."
  type        = number
  default     = 20
}

variable "api_throttling_burst_limit" {
  description = "Burst above the steady-state rate accepted by the API."
  type        = number
  default     = 40
}

variable "point_in_time_recovery_enabled" {
  description = "Enables continuous DynamoDB backups."
  type        = bool
  default     = false
}

variable "deletion_protection_enabled" {
  description = "Prevents the DynamoDB table from being destroyed."
  type        = bool
  default     = false
}

variable "admin_mfa_configuration" {
  description = "MFA policy of the administrative user pool."
  type        = string
  default     = "OPTIONAL"
}

variable "tags" {
  description = "Extra tags merged into the tags of every resource."
  type        = map(string)
  default     = {}
}
