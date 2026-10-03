provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "pontocoleta"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
