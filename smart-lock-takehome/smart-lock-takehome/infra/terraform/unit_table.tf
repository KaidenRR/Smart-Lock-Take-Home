# Unit configuration table.
#
# Stores per-unit metadata: name, status, residents, notification preferences.
# Managed by the property onboarding pipeline; the lock processor only reads.

resource "aws_dynamodb_table" "unit" {
  name         = "Unit-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Service     = "smart-lock-processor"
    Environment = var.environment
  }
}
