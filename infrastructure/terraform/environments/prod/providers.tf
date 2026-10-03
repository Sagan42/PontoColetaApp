provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "pontocoleta"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}
