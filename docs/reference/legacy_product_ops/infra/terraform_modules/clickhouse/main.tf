################################################################################
# ClickHouse Module — Single node on EC2
#
# 사이즈 결정 (네 철학: production 스킬 + 최소 사이즈):
#   - r6i.large (2 vCPU / 16GB RAM) — 메모리 우선
#   - gp3 100GB — 데모 데이터량
#
# 배치: private app subnet
# 접근: EKS workload SG → 8123 (HTTP) / 9000 (native) 만 허용
#
# ClickHouse 설치는 UserData에서 official repo로 진행.
# Production 전환 시: replicated cluster + ZooKeeper/Keeper 추가, 사이즈만 키움.
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
# Security Group
################################################################################

resource "aws_security_group" "clickhouse" {
  name        = "${var.project_name}-clickhouse-sg"
  description = "ClickHouse server. Inbound from EKS workloads."
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.project_name}-clickhouse-sg" })
}

# EKS workload → ClickHouse HTTP (8123)
resource "aws_vpc_security_group_ingress_rule" "ch_http_from_eks" {
  security_group_id            = aws_security_group.clickhouse.id
  referenced_security_group_id = var.eks_workload_security_group_id
  from_port                    = 8123
  to_port                      = 8123
  ip_protocol                  = "tcp"
  description                  = "ClickHouse HTTP from EKS"
}

# EKS workload → ClickHouse native (9000)
resource "aws_vpc_security_group_ingress_rule" "ch_native_from_eks" {
  security_group_id            = aws_security_group.clickhouse.id
  referenced_security_group_id = var.eks_workload_security_group_id
  from_port                    = 9000
  to_port                      = 9000
  ip_protocol                  = "tcp"
  description                  = "ClickHouse native from EKS"
}

# bastion → ClickHouse HTTP (디버깅용)
resource "aws_vpc_security_group_ingress_rule" "ch_http_from_bastion" {
  security_group_id            = aws_security_group.clickhouse.id
  referenced_security_group_id = var.bastion_security_group_id
  from_port                    = 8123
  to_port                      = 8123
  ip_protocol                  = "tcp"
  description                  = "ClickHouse HTTP from bastion (debug)"
}

################################################################################
# IAM Role — SSM 접근 (운영 시 SSM session으로 ClickHouse 인스턴스 진입)
################################################################################

resource "aws_iam_role" "clickhouse" {
  name = "${var.project_name}-clickhouse-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = merge(var.tags, { Name = "${var.project_name}-clickhouse-role" })
}

resource "aws_iam_role_policy_attachment" "clickhouse_ssm" {
  role       = aws_iam_role.clickhouse.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "clickhouse" {
  name = "${var.project_name}-clickhouse-profile"
  role = aws_iam_role.clickhouse.name
}

################################################################################
# AMI — Amazon Linux 2023 x86_64 (r6i = x86)
################################################################################

data "aws_ssm_parameter" "al2023_x86" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

################################################################################
# EC2 Instance
################################################################################

resource "aws_instance" "clickhouse" {
  ami           = data.aws_ssm_parameter.al2023_x86.value
  instance_type = var.instance_type

  iam_instance_profile = aws_iam_instance_profile.clickhouse.name

  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.clickhouse.id]
  associate_public_ip_address = false

  maintenance_options {
    auto_recovery = "default"
  }

  user_data = <<-EOT
    #!/bin/bash
    set -xeuo pipefail
    exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

    ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime

    # ClickHouse repo + 설치
    dnf install -y dnf-utils
    dnf-config-manager --add-repo https://packages.clickhouse.com/rpm/clickhouse.repo
    dnf install -y clickhouse-server clickhouse-client

    # 외부 인터페이스 listen (기본은 localhost only)
    cat > /etc/clickhouse-server/config.d/listen.xml <<XML
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
</clickhouse>
XML

    # 기본 user 비밀번호 (Secrets Manager 회수는 v1)
    # M2 데모: default user는 password 없음 (private subnet 내부만 접근 가능)
    # Production: SHA256 password + users.xml 별도 설정

    systemctl enable clickhouse-server
    systemctl start clickhouse-server

    echo "clickhouse ready" > /var/log/clickhouse-ready
  EOT

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
    encrypted             = true
  }

  tags = merge(var.tags, { Name = "${var.project_name}-clickhouse" })
}

################################################################################
# 추가 EBS 볼륨 — ClickHouse 데이터 디스크
#
# /var/lib/clickhouse 마운트 권장. 인스턴스 재생성 시에도 데이터 유지.
# (현재 UserData에선 마운트 자동화 안 함 — 발표 후 데이터 유지 필요하면 추가)
################################################################################

resource "aws_ebs_volume" "clickhouse_data" {
  availability_zone = aws_instance.clickhouse.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = merge(var.tags, { Name = "${var.project_name}-clickhouse-data" })
}

resource "aws_volume_attachment" "clickhouse_data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.clickhouse_data.id
  instance_id = aws_instance.clickhouse.id
}
