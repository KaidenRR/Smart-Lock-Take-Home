# Message deduplication table.
#
# Stores SHA-256 hashes of recently-processed lock events so we can drop
# at-least-once duplicate retransmissions.
#
# TTL is enforced by DynamoDB on the `expiresAt` attribute (epoch seconds).
# Items past their expiresAt are reaped by the TTL background process
# within ~48 hours of expiration.

resource "aws_dynamodb_table" "message_deduplication" {
  name         = "MessageDeduplication-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "messageHash"

  attribute {
    name = "messageHash"
    type = "S"
  }

  ttl {
    enabled        = true
    attribute_name = "expiresAt"
  }

  tags = {
    Service     = "smart-lock-processor"
    Environment = var.environment
  }
}
