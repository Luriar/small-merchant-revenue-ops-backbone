################################################################################
# EKS Module
#
# 구성:
#   - Cluster (private endpoint, public 비활성)
#   - IAM roles (cluster service role, node role)
#   - Managed nodegroup (t3.medium 2대 기본)
#   - Add-ons (vpc-cni, kube-proxy, coredns, pod-identity-agent)
#   - OIDC Provider (IRSA용)
#   - Cluster SG + bastion → 443 접근
#
# Karpenter는 별도 모듈 (modules/karpenter).
# Helm addons는 별도 모듈 (modules/helm_addons).
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

################################################################################
# IAM — Cluster Service Role
################################################################################

resource "aws_iam_role" "cluster" {
  name = "${var.project_name}-eks-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = merge(var.tags, { Name = "${var.project_name}-eks-cluster-role" })
}

resource "aws_iam_role_policy_attachment" "cluster_eks_policy" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

################################################################################
# IAM — Node Role (managed nodegroup + Karpenter 공용)
################################################################################

resource "aws_iam_role" "node" {
  name = "${var.project_name}-eks-node-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = merge(var.tags, { Name = "${var.project_name}-eks-node-role" })
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
}

resource "aws_iam_role_policy_attachment" "node_ssm" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

################################################################################
# Cluster Security Group
################################################################################

resource "aws_security_group" "cluster" {
  name        = "${var.project_name}-eks-cluster-sg"
  description = "EKS cluster security group"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name                     = "${var.project_name}-eks-cluster-sg"
    "karpenter.sh/discovery" = "${var.project_name}-eks"
  })
}

# Cluster 자체 트래픽 (control plane ↔ nodes)
resource "aws_vpc_security_group_ingress_rule" "cluster_self" {
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = aws_security_group.cluster.id
  ip_protocol                  = "-1"
  description                  = "Cluster self-traffic"
}

# bastion → cluster 443 (kubectl 접근)
resource "aws_vpc_security_group_ingress_rule" "cluster_from_bastion" {
  security_group_id            = aws_security_group.cluster.id
  referenced_security_group_id = var.bastion_security_group_id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "kubectl from bastion"
}

################################################################################
# EKS Cluster
################################################################################

resource "aws_eks_cluster" "main" {
  name     = "${var.project_name}-eks"
  version  = var.kubernetes_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = concat(var.public_subnet_ids, var.private_app_subnet_ids)
    security_group_ids      = [aws_security_group.cluster.id]
    endpoint_private_access = true
    endpoint_public_access  = false
  }

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator"]

  tags = merge(var.tags, { Name = "${var.project_name}-eks" })

  depends_on = [
    aws_iam_role_policy_attachment.cluster_eks_policy,
  ]
}

################################################################################
# Bastion AccessEntry — bastion이 kubectl 사용 가능
################################################################################

resource "aws_eks_access_entry" "bastion" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.bastion_iam_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "bastion_admin" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.bastion_iam_role_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.bastion]
}

################################################################################
# OIDC Provider (IRSA)
################################################################################

data "tls_certificate" "cluster" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  tags            = merge(var.tags, { Name = "${var.project_name}-eks-oidc" })
}

################################################################################
# Add-ons (vpc-cni, kube-proxy, coredns, pod-identity-agent)
################################################################################

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.general]
}

resource "aws_eks_addon" "pod_identity_agent" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "eks-pod-identity-agent"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

################################################################################
# Managed Nodegroup
#
# t3.medium 2대 기본. Karpenter가 부족분 추가 노드 띄움.
################################################################################

resource "aws_eks_node_group" "general" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "general"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_app_subnet_ids

  ami_type       = "AL2023_x86_64_STANDARD"
  capacity_type  = "ON_DEMAND"
  instance_types = [var.node_instance_type]

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  labels = {
    workload = "core"
  }

  tags = merge(var.tags, { Name = "${var.project_name}-eks-ng-general" })

  depends_on = [
    aws_iam_role_policy_attachment.node_worker,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_ecr,
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
  ]

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size] # Karpenter / 외부 스케일러가 조정
  }
}

################################################################################
# Karpenter용 Node Instance Profile (Karpenter 모듈에서 참조)
################################################################################

resource "aws_iam_instance_profile" "karpenter_node" {
  name = "${var.project_name}-karpenter-node-profile"
  role = aws_iam_role.node.name
  tags = merge(var.tags, { Name = "${var.project_name}-karpenter-node-profile" })
}
