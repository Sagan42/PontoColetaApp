variable "aws_region" {
  description = "Region where the development environment is deployed."
  type        = string
  default     = "us-east-1"
}

variable "geocoding_user_agent" {
  description = "User-Agent sent to Nominatim. Must identify the project and a contact address."
  type        = string
  default     = "PontoColeta-dev/1.0 (contato@example.com)"
}
