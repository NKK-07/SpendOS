terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "spendos-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "spendos-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "SpendOS"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

module "network" {
  source = "./modules/network"

  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "secrets" {
  source = "./modules/secrets"

  environment = var.environment
}

module "storage" {
  source = "./modules/storage"

  environment = var.environment
}

module "database" {
  source = "./modules/database"

  environment       = var.environment
  vpc_id            = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  db_secret_arn     = module.secrets.db_secret_arn
  kms_key_arn       = module.secrets.kms_key_arn
}

module "redis" {
  source = "./modules/redis"

  environment       = var.environment
  vpc_id            = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
}

module "compute" {
  source = "./modules/compute"

  environment        = var.environment
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids

  db_endpoint        = module.database.cluster_endpoint
  redis_endpoint     = module.redis.cluster_endpoint
  
  db_sg_id           = module.database.security_group_id
  redis_sg_id        = module.redis.security_group_id

  db_secret_arn      = module.secrets.db_secret_arn
  app_secrets_arn    = module.secrets.app_secrets_arn
  kms_key_arn        = module.secrets.kms_key_arn
}
