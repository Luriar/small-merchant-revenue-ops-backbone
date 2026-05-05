################################################################################
# Endpoints module
#
# M1에 필요한 VPC Endpoint:
#   - SSM 3종 (ssm, ssmmessages, ec2messages) — bastion이 SSM session으로 접근
#   - S3 Gateway — Secrets Manager가 내부적으로 사용 + 일반 S3 접근
#   - Secrets Manager Interface — bastion이 Aurora credential 회수
#
# 모든 Interface endpoint는 private app subnet에 배치 (bastion이 거기서 호출).
# S3 Gateway는 모든 private route table에 연결.
#
# Security Group:
#   VpcEndpointSecurityGroup — VPC 내부에서 HTTPS(443) inbound 허용
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

data "aws_region" "current" {}

################################################################################
# VPC Endpoint용 Security Group
################################################################################

resource "aws_security_group" "vpce" {
  name        = "${var.project_name}-vpce-sg"
  description = "VPC Endpoints HTTPS inbound from within VPC"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from within VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-sg"
  })
}

################################################################################
# Interface endpoints — SSM 3종
################################################################################

resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-ssm"
  })
}

resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-ssmmessages"
  })
}

resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-ec2messages"
  })
}

################################################################################
# Interface endpoint — Secrets Manager
# bastion이 Aurora master credential 회수 시 사용
################################################################################

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-secretsmanager"
  })
}

################################################################################
# Gateway endpoint — S3
# 모든 private route table에 연결 (bastion이 yum/dnf로 패키지 설치 시 사용 가능)
################################################################################

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = concat(
    var.private_app_route_table_ids,
    var.private_db_route_table_ids,
  )

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpce-s3"
  })
}
