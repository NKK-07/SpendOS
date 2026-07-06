variable "environment" {}
variable "vpc_id" {}
variable "private_subnet_ids" { type = list(string) }

resource "aws_elasticache_subnet_group" "redis" {
  name       = "spendos-redis-subnet-group-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "SpendOS Redis Subnet Group ${var.environment}"
  }
}

resource "aws_security_group" "redis" {
  name        = "spendos-redis-sg-${var.environment}"
  description = "Security group for ElastiCache Redis"
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

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "spendos-redis-${var.environment}"
  description                = "SpendOS Redis Cluster ${var.environment}"
  engine                     = "redis"
  engine_version             = "7.0"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = 2 # Multi-AZ (1 primary, 1 replica)
  automatic_failover_enabled = true
  multi_az_enabled           = true
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

output "cluster_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "security_group_id" {
  value = aws_security_group.redis.id
}
