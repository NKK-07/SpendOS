variable "environment" {}
variable "vpc_id" {}
variable "private_subnet_ids" { type = list(string) }
variable "db_secret_arn" {}
variable "kms_key_arn" {}

resource "aws_db_subnet_group" "aurora" {
  name       = "spendos-aurora-subnet-group-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "SpendOS Aurora Subnet Group ${var.environment}"
  }
}

resource "aws_security_group" "aurora" {
  name        = "spendos-aurora-sg-${var.environment}"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = var.vpc_id

  # Ingress rule is added in compute module referencing the ECS SG

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_vpc" "main" {
  id = var.vpc_id
}

# Fetch secret for master password
data "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = var.db_secret_arn
}

locals {
  db_creds = jsondecode(data.aws_secretsmanager_secret_version.db_credentials.secret_string)
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "spendos-aurora-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4" # Or desired version
  database_name           = "spendos_${var.environment}"
  master_username         = local.db_creds.username
  master_password         = local.db_creds.password
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.aurora.id]
  storage_encrypted       = true
  kms_key_id              = var.kms_key_arn
  skip_final_snapshot     = true
  
  serverlessv2_scaling_configuration {
    max_capacity = 64
    min_capacity = 2
  }
}

resource "aws_rds_cluster_instance" "aurora_instances" {
  count                = 2 # Multi-AZ
  identifier           = "spendos-aurora-instance-${count.index}-${var.environment}"
  cluster_identifier   = aws_rds_cluster.aurora.id
  instance_class       = "db.serverless"
  engine               = aws_rds_cluster.aurora.engine
  engine_version       = aws_rds_cluster.aurora.engine_version
  publicly_accessible  = false
  db_subnet_group_name = aws_db_subnet_group.aurora.name
}

output "cluster_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "security_group_id" {
  value = aws_security_group.aurora.id
}
