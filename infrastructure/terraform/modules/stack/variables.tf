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

# O Nominatim publico recusa requisicoes vindas de IP de nuvem, e recusa em
# silencio: HTTP 200 com lista vazia, que o app mostra como "endereco nao
# encontrado". Por isso o padrao em producao passa a ser a API do Google, que
# permite uso em servidor e distingue recusa de ausencia de resultado.
variable "geocoding_provider" {
  description = "Geocoding provider: nominatim (free, blocked from cloud IPs) or google."
  type        = string
  default     = "google"

  validation {
    condition     = contains(["nominatim", "google"], var.geocoding_provider)
    error_message = "geocoding_provider must be either nominatim or google."
  }
}

variable "geocoding_api_key" {
  description = "Google Geocoding API key. Required when geocoding_provider is google."
  type        = string
  sensitive   = true
  default     = ""

  # Validacao entre variaveis exige Terraform 1.9, que ja e o minimo do projeto.
  # Falhar no plan e muito melhor que descobrir no primeiro cadastro de ponto:
  # sem a chave, a Lambda nem sobe com o provedor google.
  validation {
    condition     = var.geocoding_provider != "google" || var.geocoding_api_key != ""
    error_message = "geocoding_api_key is required when geocoding_provider is google."
  }
}

variable "geocoding_base_url" {
  description = "Base URL of the geocoding provider. Only used by the nominatim provider."
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
  default     = 8

  validation {
    condition     = var.public_lambda_timeout_seconds * 1000 > var.geocoding_timeout_ms
    error_message = "public_lambda_timeout_seconds must exceed geocoding_timeout_ms, or a slow geocoding call kills the invocation before it can answer."
  }
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

variable "table_max_read_request_units" {
  description = "Read units per second the table may scale to. Ceiling against an abusive read loop."
  type        = number
  default     = 500
}

variable "table_max_write_request_units" {
  description = "Write units per second the table may scale to."
  type        = number
  default     = 20
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

variable "monthly_budget_usd" {
  description = "Monthly budget in USD. Notifications fire at 50, 80 and 100 percent of actual spend, and at 100 percent of the forecast."
  type        = number
  default     = 20
}

variable "cost_alert_email" {
  description = "Address that receives the budget notifications and the CloudWatch alarms. No default on purpose: an alert nobody reads is not an alert."
  type        = string
}

variable "tags" {
  description = "Extra tags merged into the tags of every resource."
  type        = map(string)
  default     = {}
}
