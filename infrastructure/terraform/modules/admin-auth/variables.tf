variable "user_pool_name" {
  description = "Name of the Cognito user pool that holds the administrative account."
  type        = string
}

variable "mfa_configuration" {
  description = "MFA policy of the pool: OFF, OPTIONAL or ON. Recommended ON in production."
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, OPTIONAL or ON."
  }
}

variable "aws_region" {
  description = "Region of the pool, used to build the token issuer URL."
  type        = string
}

variable "tags" {
  description = "Tags applied to the user pool."
  type        = map(string)
  default     = {}
}
