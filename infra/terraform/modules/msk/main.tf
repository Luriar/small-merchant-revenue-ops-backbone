################################################################################
# MSK Serverless Module
#
# Serverless라 사이즈 결정 없음 (throughput 자동 스케일).
# IAM 인증 (AWS_MSK_IAM SASL).
#
# Production 전환: 같은 코드, 같은 Serverless. 토픽 throughput만 늘어남.
# (대규모 운영 시 provisioned로 전환 가능 — 그땐 사이즈 결정 필요)
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

################################################################################
# Security Group
################################################################################

resource "aws_security_group" "msk" {
  name        = "${var.project_name}-msk-sg"
  description = "MSK Serverless cluster"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.project_name}-msk-sg" })
}

# EKS workload → MSK 9098 (IAM SASL)
resource "aws_vpc_security_group_ingress_rule" "msk_from_eks" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = var.eks_workload_security_group_id
  from_port                    = 9098
  to_port                      = 9098
  ip_protocol                  = "tcp"
  description                  = "Kafka SASL_SSL from EKS"
}

# bastion → MSK (디버깅, kafka-console-consumer 등)
resource "aws_vpc_security_group_ingress_rule" "msk_from_bastion" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = var.bastion_security_group_id
  from_port                    = 9098
  to_port                      = 9098
  ip_protocol                  = "tcp"
  description                  = "Kafka from bastion (debug)"
}

# ClickHouse → MSK (Kafka engine consumer)
resource "aws_vpc_security_group_ingress_rule" "msk_from_clickhouse" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = var.clickhouse_security_group_id
  from_port                    = 9098
  to_port                      = 9098
  ip_protocol                  = "tcp"
  description                  = "Kafka from ClickHouse"
}

################################################################################
# MSK Serverless Cluster
################################################################################

resource "aws_msk_serverless_cluster" "main" {
  cluster_name = "${var.project_name}-msk"

  vpc_config {
    subnet_ids         = var.private_app_subnet_ids
    security_group_ids = [aws_security_group.msk.id]
  }

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }

  tags = merge(var.tags, { Name = "${var.project_name}-msk" })
}
