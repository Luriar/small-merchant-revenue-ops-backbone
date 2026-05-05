################################################################################
# Bastion module
#
# CFN의 CommandHost를 M1용으로 단순화:
#   - Public IP 없음 (private app subnet에 배치, SSM session으로만 접근)
#   - SSH 인바운드 없음
#   - UserData는 최소 (psql 도구만 설치)
#
# Security Group은 외부에서 주입 (envs/dev에서 만들어 Aurora SG가 참조)
# 모듈 내에선 만들지 않음 → 순환 의존 회피
#
# 접속:
#   aws ssm start-session --target <instance-id>
#
# Aurora port forwarding:
#   aws ssm start-session \
#     --target <instance-id> \
#     --document-name AWS-StartPortForwardingSessionToRemoteHost \
#     --parameters 'host=<aurora-endpoint>,portNumber=5432,localPortNumber=5432'
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
# IAM
################################################################################

resource "aws_iam_role" "bastion" {
  name = "${var.project_name}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-bastion-role"
  })
}

resource "aws_iam_role_policy_attachment" "bastion_ssm_core" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "bastion_secrets" {
  name = "${var.project_name}-bastion-secrets"
  role = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
      ]
      Resource = var.aurora_secret_arn
    }]
  })
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.project_name}-bastion-instance-profile"
  role = aws_iam_role.bastion.name
}

################################################################################
# AMI — Amazon Linux 2023 ARM64
################################################################################

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

################################################################################
# EC2 Instance
################################################################################

resource "aws_instance" "bastion" {
  ami           = data.aws_ssm_parameter.al2023_arm64.value
  instance_type = var.instance_type

  iam_instance_profile = aws_iam_instance_profile.bastion.name

  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.security_group_id]
  associate_public_ip_address = false

  maintenance_options {
    auto_recovery = "default"
  }

  user_data = <<-EOT
    #!/bin/bash
    set -xeuo pipefail
    exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

    ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime

    dnf install -y jq unzip tar gzip postgresql15

    aws --version

    echo 'export AWS_PAGER=""' >> /etc/profile
    echo "export AWS_DEFAULT_REGION=${data.aws_region.current.name}" >> /etc/profile

    echo "bastion ready" > /var/log/bastion-ready
  EOT

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = true
    encrypted             = true
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-bastion"
  })
}
