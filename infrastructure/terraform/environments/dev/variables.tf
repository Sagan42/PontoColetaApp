variable "aws_region" {
  description = "Region where the development environment is deployed."
  type        = string
  default     = "sa-east-1"
}

variable "geocoding_user_agent" {
  description = "User-Agent sent to Nominatim. Must identify the project and a contact address."
  type        = string
  default     = "PontoColeta-dev/1.0 (contato@example.com)"
}

# No default: terraform asks for it, or it comes from a tfvars file. A budget
# alert sent nowhere is the same as no budget alert.
variable "cost_alert_email" {
  description = "Address that receives the budget notifications and the abuse alarms of dev."
  type        = string
}
