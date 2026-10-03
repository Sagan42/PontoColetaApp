variable "table_name" {
  description = "Name of the DynamoDB table that stores collection points and daily metrics."
  type        = string
}

variable "point_in_time_recovery_enabled" {
  description = "Enables continuous backups. Recommended in production; adds cost in dev."
  type        = bool
  default     = false
}

variable "deletion_protection_enabled" {
  description = "Prevents the table from being destroyed by Terraform or the console."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to the table."
  type        = map(string)
  default     = {}
}
