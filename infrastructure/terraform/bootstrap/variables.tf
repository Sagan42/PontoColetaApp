variable "aws_region" {
  description = "Region of the state bucket. Keep it equal to the region of the environments."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally unique bucket name, e.g. pontocoleta-tfstate-<account-id>."
  type        = string
}
