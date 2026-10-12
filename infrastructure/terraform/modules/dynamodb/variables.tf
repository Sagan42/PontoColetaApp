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

# On-demand scales without a ceiling by default, which is exactly what makes an
# abusive read loop expensive. These caps turn that into throttling instead of
# a bill. Sized from the API throttle: see docs/terraform.md.
variable "max_read_request_units" {
  description = "Read units per second the table may scale to. Beyond it, DynamoDB throttles."
  type        = number
  default     = 500
}

variable "max_write_request_units" {
  description = "Write units per second the table may scale to."
  type        = number
  default     = 20
}

variable "index_max_read_request_units" {
  description = "Read units per second each global secondary index may scale to."
  type        = number
  default     = 500
}

variable "index_max_write_request_units" {
  description = "Write units per second each global secondary index may scale to."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Tags applied to the table."
  type        = map(string)
  default     = {}
}
