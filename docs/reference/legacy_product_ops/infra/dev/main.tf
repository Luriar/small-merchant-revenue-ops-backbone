################################################################################
# envs/dev — M2 main
#
# 의존 순서:
#   network (NAT 포함) → bastion_sg → endpoints → aurora → bastion
#                                  → eks → karpenter → helm_addons → argocd
#                                       → msk → clickhouse
#                                       → airflow (msk 의존)
#
# var.enable_m2 = false 면 M1 상태 그대로 (EKS 등 미생성).
################################################################################

################################################################################
# Network (NAT M2 활성화)
################################################################################

module "network" {
  source = "../../modules/network"

  project_name       = var.project_name
  vpc_cidr           = var.vpc_cidr
  azs                = var.azs
  enable_nat_gateway = var.enable_m2 # M2 = true
}

################################################################################
# Bastion SG (envs 레벨 - Aurora가 inbound source로 참조)
################################################################################

resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion-sg"
  description = "SSM bastion. Inbound none, outbound all."
  vpc_id      = module.network.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-bastion-sg"
  }
}

################################################################################
# VPC Endpoints
################################################################################

module "endpoints" {
  source = "../../modules/endpoints"

  project_name                = var.project_name
  vpc_id                      = module.network.vpc_id
  vpc_cidr                    = module.network.vpc_cidr
  private_app_subnet_ids      = module.network.private_app_subnet_ids
  private_app_route_table_ids = module.network.private_app_route_table_ids
  private_db_route_table_ids  = module.network.private_db_route_table_ids
}

################################################################################
# Aurora
################################################################################

module "aurora" {
  source = "../../modules/aurora"

  project_name              = var.project_name
  vpc_id                    = module.network.vpc_id
  private_db_subnet_ids     = module.network.private_db_subnet_ids
  bastion_security_group_id = aws_security_group.bastion.id

  engine_version      = var.aurora_engine_version
  min_capacity        = var.aurora_min_capacity
  max_capacity        = var.aurora_max_capacity
  deletion_protection = var.aurora_deletion_protection
}

################################################################################
# Bastion (M1과 동일)
################################################################################

module "bastion" {
  source = "../../modules/bastion"

  project_name      = var.project_name
  subnet_id         = module.network.private_app_subnet_ids[0]
  security_group_id = aws_security_group.bastion.id
  aurora_secret_arn = module.aurora.secret_arn

  depends_on = [module.endpoints]
}

################################################################################
# === M2 컴포넌트 (var.enable_m2=true 시 생성) ===
################################################################################

################################################################################
# EKS
################################################################################

module "eks" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/eks"

  project_name              = var.project_name
  vpc_id                    = module.network.vpc_id
  public_subnet_ids         = module.network.public_subnet_ids
  private_app_subnet_ids    = module.network.private_app_subnet_ids
  bastion_security_group_id = aws_security_group.bastion.id
  bastion_iam_role_arn      = module.bastion.iam_role_arn

  kubernetes_version = var.kubernetes_version
  node_instance_type = var.node_instance_type
}

################################################################################
# Karpenter (IAM + SQS) — Helm은 helm_addons에서
################################################################################

module "karpenter" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/karpenter"

  project_name      = var.project_name
  oidc_provider_arn = module.eks[0].oidc_provider_arn
  oidc_provider_url = module.eks[0].oidc_provider_url
  node_role_arn     = module.eks[0].node_role_arn
}

################################################################################
# MSK Serverless
################################################################################

module "msk" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/msk"

  project_name                   = var.project_name
  vpc_id                         = module.network.vpc_id
  private_app_subnet_ids         = module.network.private_app_subnet_ids
  eks_workload_security_group_id = module.eks[0].cluster_managed_security_group_id
  bastion_security_group_id      = aws_security_group.bastion.id
  clickhouse_security_group_id   = module.clickhouse[0].security_group_id
}

################################################################################
# ClickHouse
################################################################################

module "clickhouse" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/clickhouse"

  project_name                   = var.project_name
  vpc_id                         = module.network.vpc_id
  subnet_id                      = module.network.private_app_subnet_ids[0]
  instance_type                  = var.clickhouse_instance_type
  eks_workload_security_group_id = module.eks[0].cluster_managed_security_group_id
  bastion_security_group_id      = aws_security_group.bastion.id
}

################################################################################
# Airflow (MWAA) — MSK 이후 (IAM 권한 의존)
################################################################################

module "airflow" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/airflow"

  project_name           = var.project_name
  vpc_id                 = module.network.vpc_id
  private_app_subnet_ids = module.network.private_app_subnet_ids
  msk_cluster_arn        = module.msk[0].cluster_arn
  environment_class      = var.airflow_environment_class
}

# Aurora SG에 EKS workload inbound 추가 (M2 only)
resource "aws_vpc_security_group_ingress_rule" "aurora_from_eks" {
  count                        = var.enable_m2 ? 1 : 0
  security_group_id            = module.aurora.security_group_id
  referenced_security_group_id = module.eks[0].cluster_managed_security_group_id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from EKS workload (M2)"
}

################################################################################
# Helm addons (Karpenter / ALB Controller / Strimzi / Prometheus / Argo Rollouts)
################################################################################

module "helm_addons" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/helm_addons"

  project_name                      = var.project_name
  vpc_id                            = module.network.vpc_id
  cluster_name                      = module.eks[0].cluster_name
  oidc_provider_arn                 = module.eks[0].oidc_provider_arn
  oidc_provider_url                 = module.eks[0].oidc_provider_url
  karpenter_controller_role_arn     = module.karpenter[0].controller_role_arn
  karpenter_interruption_queue_name = module.karpenter[0].interruption_queue_name

  depends_on = [module.eks]
}

################################################################################
# Argo CD (helm_addons와 별도 — 의존 분리)
################################################################################

module "argocd" {
  count  = var.enable_m2 ? 1 : 0
  source = "../../modules/argocd"

  depends_on = [module.eks]
}
