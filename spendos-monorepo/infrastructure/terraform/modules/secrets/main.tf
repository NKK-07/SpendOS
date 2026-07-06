variable "environment" {}

resource "aws_kms_key" "secrets_key" {
  description             = "KMS key for SpendOS secrets ${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "spendos-secrets-key-${var.environment}"
  }
}

resource "aws_kms_alias" "secrets_key_alias" {
  name          = "alias/spendos-secrets-key-${var.environment}"
  target_key_id = aws_kms_key.secrets_key.key_id
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "spendos/${var.environment}/database"
  description = "Database credentials for SpendOS ${var.environment}"
  kms_key_id  = aws_kms_key.secrets_key.arn
}

resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "spendos/${var.environment}/app"
  description = "Application secrets (JWT, Reset, MFA) for SpendOS ${var.environment}"
  kms_key_id  = aws_kms_key.secrets_key.arn
}

output "db_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}

output "app_secrets_arn" {
  value = aws_secretsmanager_secret.app_secrets.arn
}

output "kms_key_arn" {
  value = aws_kms_key.secrets_key.arn
}
