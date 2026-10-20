variable "api_name" {
  description = "Name of the HTTP API, including the environment suffix."
  type        = string
}

variable "environment" {
  description = "Environment this API belongs to (dev or prod)."
  type        = string
}

variable "public_lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda that serves the public routes."
  type        = string
}

variable "public_lambda_function_name" {
  description = "Name of the public Lambda, used by the invoke permission."
  type        = string
}

variable "admin_lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda that serves the administrative routes."
  type        = string
}

variable "admin_lambda_function_name" {
  description = "Name of the administrative Lambda, used by the invoke permission."
  type        = string
}

variable "public_routes" {
  description = "Route keys served without authentication."
  type        = list(string)

  default = [
    "GET /v1/health",
    "GET /v1/materials",
    "GET /v1/collection-points",
    "POST /v1/collection-points",
    "GET /v1/collection-points/nearby",
    "GET /v1/collection-points/{id}",
    "POST /v1/metrics/events",
    "POST /v1/feedback",
  ]
}

variable "admin_routes" {
  description = "Route keys that require a valid administrator token."
  type        = list(string)
  default = [
    "GET /v1/admin/metrics",
    "GET /v1/admin/feedback",
    "POST /v1/admin/collection-points/{id}/hide",
    "POST /v1/admin/collection-points/{id}/publish",
  ]
}

variable "admin_jwt_issuer" {
  description = "Cognito user pool issuer URL used to validate administrator tokens."
  type        = string
}

variable "admin_jwt_audience" {
  description = "Cognito app client id accepted as the token audience."
  type        = string
}

# Empty is the right default here. The mobile app is a native client: it never
# sends an Origin header, so it needs no CORS at all. Open an origin only for a
# local tool that genuinely needs one, adding that exact origin case by case —
# never "*", which would let any web page in any browser call this API.
# Writes cost more than reads downstream: a point creation is a transactional
# write plus a geocoding call, and a metric event writes on every app open. They
# get a tighter ceiling than the stage default so a flood of writes cannot ride
# in under the overall rate. Feedback is typed by hand by a person, so 1 rps
# with a burst of 3 is generous for the real use and hostile to a bot loop.
variable "route_throttling" {
  description = "Per-route throttling on top of default_route_settings, keyed by route key."
  type        = map(object({ rate_limit = number, burst_limit = number }))

  default = {
    "POST /v1/collection-points" = { rate_limit = 1, burst_limit = 5 }
    "POST /v1/metrics/events"    = { rate_limit = 1, burst_limit = 5 }
    "POST /v1/feedback"          = { rate_limit = 1, burst_limit = 3 }
  }
}

variable "cors_allow_origins" {
  description = "Origins allowed by CORS. Empty disables it. The mobile app does not need CORS; add an exact origin only for a local tool that does."
  type        = list(string)
  default     = []
}

variable "throttling_rate_limit" {
  description = "Steady-state request rate allowed per second across the API."
  type        = number
  default     = 20
}

variable "throttling_burst_limit" {
  description = "Burst capacity allowed above the steady-state rate."
  type        = number
  default     = 40
}

variable "integration_timeout_ms" {
  description = "How long API Gateway waits for a Lambda response."
  type        = number
  default     = 15000
}

variable "log_retention_days" {
  description = "Retention of the API access logs."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags applied to every resource of the module."
  type        = map(string)
  default     = {}
}
