resource "random_password" "master" {
  count = var.enable_aurora ? 1 : 0

  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "master" {
  count = var.enable_aurora ? 1 : 0

  name        = "/${var.name_prefix}/aurora/master"
  description = "Aurora master credentials for small-merchant Revenue Ops."
  kms_key_id  = var.use_kms ? var.kms_key_arn : null

  tags = merge(var.tags, {
    Name   = "/${var.name_prefix}/aurora/master"
    Secret = "true"
  })
}

resource "aws_secretsmanager_secret_version" "master" {
  count = var.enable_aurora ? 1 : 0

  secret_id = aws_secretsmanager_secret.master[0].id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master[0].result
    database = var.database_name
  })
}

resource "aws_db_subnet_group" "aurora" {
  count = var.enable_aurora ? 1 : 0

  name       = "${var.name_prefix}-aurora"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-aurora"
  })
}

resource "aws_security_group" "aurora" {
  count = var.enable_aurora ? 1 : 0

  name        = "${var.name_prefix}-aurora"
  description = "Aurora Serverless v2 access for small-merchant Revenue Ops."
  vpc_id      = var.vpc_id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-aurora"
  })
}

resource "aws_security_group_rule" "aurora_ingress" {
  for_each = var.enable_aurora ? toset(var.allowed_security_group_ids) : toset([])

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.aurora[0].id
  source_security_group_id = each.value
  description              = "PostgreSQL access from approved runtime security group."
}

resource "aws_security_group_rule" "aurora_egress" {
  count = var.enable_aurora ? 1 : 0

  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.aurora[0].id
  description       = "Default outbound for Aurora cluster operations."
}

resource "aws_rds_cluster" "aurora" {
  count = var.enable_aurora ? 1 : 0

  cluster_identifier              = "${var.name_prefix}-aurora"
  engine                          = "aurora-postgresql"
  engine_version                  = var.engine_version
  database_name                   = var.database_name
  master_username                 = var.master_username
  master_password                 = random_password.master[0].result
  db_subnet_group_name            = aws_db_subnet_group.aurora[0].name
  vpc_security_group_ids          = [aws_security_group.aurora[0].id]
  storage_encrypted               = true
  kms_key_id                      = var.use_kms ? var.kms_key_arn : null
  deletion_protection             = true
  backup_retention_period         = 7
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = var.min_acu
    max_capacity = var.max_acu
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-aurora"
  })
}

resource "aws_rds_cluster_instance" "aurora" {
  count = var.enable_aurora ? 1 : 0

  identifier         = "${var.name_prefix}-aurora-1"
  cluster_identifier = aws_rds_cluster.aurora[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora[0].engine
  engine_version     = aws_rds_cluster.aurora[0].engine_version

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-aurora-1"
  })
}
