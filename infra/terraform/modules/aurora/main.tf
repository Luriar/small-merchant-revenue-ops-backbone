################################################################################
# Aurora module
#
# 구성:
#   - Aurora PostgreSQL Serverless v2 cluster
#   - Writer instance 1개 (M1)
#   - DB subnet group (2 AZ)
#   - Custom parameter group (M2 CDC 대비, 기본값으로 시작)
#   - Aurora SG (bastion → Aurora:5432만 허용)
#   - Secrets Manager secret (master credential)
#
# 설계 결정:
#   - PostgreSQL 15.x (publication 컬럼 필터 기능 전제, M2 CDC용)
#   - Master password 인증 (IAM auth는 EKS 진입할 때)
#   - AWS-managed KMS (CMK는 향후)
#   - Custom parameter group 'productops-aurora-cdc-ready-v1' 미리 만들어둠
#     M2에서 rds.logical_replication=1 등 추가 시 인스턴스 재생성 회피
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

################################################################################
# Master credential — Secrets Manager
################################################################################

resource "random_password" "master" {
  length  = 32
  special = true
  # Aurora가 거부하는 특수문자 제외
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "master" {
  name                    = "${var.project_name}-aurora-master"
  description             = "Aurora master credential (auto-generated)"
  recovery_window_in_days = 7

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-master"
  })
}

resource "aws_secretsmanager_secret_version" "master" {
  secret_id = aws_secretsmanager_secret.master.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    engine   = "postgres"
    host     = aws_rds_cluster.main.endpoint
    port     = aws_rds_cluster.main.port
    dbname   = var.database_name
  })
}

################################################################################
# DB subnet group
################################################################################

resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-aurora-subnet-group"
  subnet_ids  = var.private_db_subnet_ids
  description = "Aurora cluster subnet group (private DB subnets, 2 AZ)"

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-subnet-group"
  })
}

################################################################################
# Cluster parameter group — M2 CDC 대비
#
# M1에선 default 값으로 시작.
# M2 CDC 도입 시 다음 추가:
#   rds.logical_replication = 1
#   max_replication_slots   = 10
#   max_wal_senders         = 10
#   wal_sender_timeout      = 0
#
# parameter group을 미리 분리해두면 인스턴스 재생성 없이 ALTER만으로 진행 가능.
################################################################################

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "${var.project_name}-aurora-cdc-ready-v1"
  family      = "aurora-postgresql15"
  description = "Aurora PG15 cluster parameters. Prepared for M2 CDC."

  # M1: 추가 파라미터 없음 (default 값)
  # M2: 아래 주석 해제
  #
  # parameter {
  #   name         = "rds.logical_replication"
  #   value        = "1"
  #   apply_method = "pending-reboot"
  # }
  # parameter {
  #   name         = "max_replication_slots"
  #   value        = "10"
  #   apply_method = "pending-reboot"
  # }
  # parameter {
  #   name         = "max_wal_senders"
  #   value        = "10"
  #   apply_method = "pending-reboot"
  # }
  # parameter {
  #   name         = "wal_sender_timeout"
  #   value        = "0"
  #   apply_method = "immediate"
  # }

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-cdc-ready-v1"
  })

  lifecycle {
    create_before_destroy = true
  }
}

################################################################################
# Security Group — bastion만 5432 inbound 허용
################################################################################

resource "aws_security_group" "aurora" {
  name        = "${var.project_name}-aurora-sg"
  description = "Aurora cluster. Inbound: bastion to 5432 only."
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from bastion"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.bastion_security_group_id]
  }

  # M2: EKS pod에서 접근 시 추가
  # ingress {
  #   description     = "PostgreSQL from EKS workload"
  #   from_port       = 5432
  #   to_port         = 5432
  #   protocol        = "tcp"
  #   security_groups = [var.eks_workload_security_group_id]
  # }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-sg"
  })
}

################################################################################
# Aurora cluster (Serverless v2)
################################################################################

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.project_name}-aurora"

  engine         = "aurora-postgresql"
  engine_mode    = "provisioned"
  engine_version = var.engine_version

  database_name   = var.database_name
  master_username = var.master_username
  master_password = random_password.master.result

  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.aurora.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  # Serverless v2 capacity
  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  # Encryption (default storage encryption은 항상 ON)
  storage_encrypted = true
  # KMS는 AWS-managed (kms_key_id 생략 = aws/rds 사용)

  # 백업
  backup_retention_period      = var.backup_retention_period
  preferred_backup_window      = "16:00-17:00" # UTC = KST 01:00-02:00
  preferred_maintenance_window = "tue:17:00-tue:18:00"

  # 보안
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot
  # final_snapshot_identifier는 skip_final_snapshot=false일 때만 의미 있음

  # 로그
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # 변경 사항 즉시 적용 여부
  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora"
  })

  # CDC parameter group 변경 시 cluster 재시작 필요. lifecycle 명시.
  lifecycle {
    ignore_changes = [
      # master_password를 random으로 두면 매번 변경 감지됨 — random_password 자체가 stable하니 OK
      # 단, 추후 외부 회전 도입 시 ignore_changes 추가 고려
    ]
  }
}

################################################################################
# Aurora cluster instance (Serverless v2)
################################################################################

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${var.project_name}-aurora-writer-1"
  cluster_identifier = aws_rds_cluster.main.id

  engine         = aws_rds_cluster.main.engine
  engine_version = aws_rds_cluster.main.engine_version

  instance_class = "db.serverless"

  db_subnet_group_name = aws_db_subnet_group.main.name

  publicly_accessible = false

  # Performance Insights (M1엔 무료 tier로 충분)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # 모니터링 (Enhanced Monitoring은 추가 IAM role 필요 → M2)
  # monitoring_interval = 60
  # monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn

  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-writer-1"
  })
}
