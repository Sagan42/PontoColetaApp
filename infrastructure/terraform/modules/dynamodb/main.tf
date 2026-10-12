resource "aws_dynamodb_table" "main" {
  name = var.table_name

  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1-status"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"

    on_demand_throughput {
      max_read_request_units  = var.index_max_read_request_units
      max_write_request_units = var.index_max_write_request_units
    }
  }

  global_secondary_index {
    name            = "GSI2-geo"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"

    on_demand_throughput {
      max_read_request_units  = var.index_max_read_request_units
      max_write_request_units = var.index_max_write_request_units
    }
  }

  # A ceiling, not a reservation: on-demand still costs only what it serves.
  on_demand_throughput {
    max_read_request_units  = var.max_read_request_units
    max_write_request_units = var.max_write_request_units
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  deletion_protection_enabled = var.deletion_protection_enabled

  tags = var.tags
}
