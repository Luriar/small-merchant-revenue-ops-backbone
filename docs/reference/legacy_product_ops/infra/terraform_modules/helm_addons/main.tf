################################################################################
# Helm Addons Module
#
# 클러스터에 Helm으로 설치할 컴포넌트:
#   1. Karpenter
#   2. AWS Load Balancer Controller (IRSA)
#   3. Strimzi Operator
#   4. kube-prometheus-stack
#   5. Argo Rollouts
#
# Argo CD는 별도 모듈 (modules/argocd) — bootstrap 우선순위 다름.
#
# IRSA 필요한 controller (ALB Controller)는 IAM Role도 만든다.
# Karpenter IRSA는 modules/karpenter에서 만들었음.
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  oidc_url = replace(var.oidc_provider_url, "https://", "")
}

################################################################################
# Karpenter — Helm
################################################################################

resource "helm_release" "karpenter" {
  namespace        = "karpenter"
  create_namespace = true
  name             = "karpenter"
  repository       = "oci://public.ecr.aws/karpenter"
  chart            = "karpenter"
  version          = var.karpenter_version

  values = [yamlencode({
    serviceAccount = {
      annotations = {
        "eks.amazonaws.com/role-arn" = var.karpenter_controller_role_arn
      }
    }
    settings = {
      clusterName       = var.cluster_name
      interruptionQueue = var.karpenter_interruption_queue_name
    }
    controller = {
      resources = {
        requests = { cpu = "100m", memory = "256Mi" }
        limits   = { memory = "512Mi" }
      }
    }
  })]
}

################################################################################
# AWS Load Balancer Controller — IRSA + Helm
################################################################################

# IAM Role
data "aws_iam_policy_document" "alb_controller_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role" "alb_controller" {
  name               = "${var.project_name}-alb-controller"
  assume_role_policy = data.aws_iam_policy_document.alb_controller_assume.json
  tags               = merge(var.tags, { Name = "${var.project_name}-alb-controller" })
}

# AWS Load Balancer Controller 공식 IAM policy
# 전체 IAM JSON은 길어서 외부 파일 참조. 여기서는 가장 핵심 권한만.
# 운영 시: https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/install/iam_policy.json
resource "aws_iam_role_policy" "alb_controller" {
  name = "alb-controller-policy"
  role = aws_iam_role.alb_controller.id

  # 단축 버전 — 데모 충분
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:CreateServiceLinkedRole",
          "ec2:Describe*",
          "ec2:GetSecurityGroupsForVpc",
          "elasticloadbalancing:Describe*",
          "elasticloadbalancing:Create*",
          "elasticloadbalancing:Modify*",
          "elasticloadbalancing:Delete*",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:SetSecurityGroups",
          "cognito-idp:DescribeUserPoolClient",
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "iam:ListServerCertificates",
          "iam:GetServerCertificate",
          "wafv2:*",
          "shield:*",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "helm_release" "alb_controller" {
  namespace  = "kube-system"
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.alb_controller_version

  values = [yamlencode({
    clusterName = var.cluster_name
    region      = data.aws_region.current.name
    vpcId       = var.vpc_id
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.alb_controller.arn
      }
    }
  })]
}

################################################################################
# Strimzi Operator
################################################################################

resource "helm_release" "strimzi" {
  namespace        = "kafka"
  create_namespace = true
  name             = "strimzi-kafka-operator"
  repository       = "https://strimzi.io/charts/"
  chart            = "strimzi-kafka-operator"
  version          = var.strimzi_version

  values = [yamlencode({
    watchAnyNamespace = true
  })]
}

################################################################################
# kube-prometheus-stack (Prometheus + Grafana + Alertmanager)
################################################################################

resource "helm_release" "kube_prometheus_stack" {
  namespace        = "monitoring"
  create_namespace = true
  name             = "kube-prometheus-stack"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  version          = var.kube_prometheus_stack_version

  values = [yamlencode({
    grafana = {
      adminPassword = "admin" # 데모용. Production은 Secret 주입.
      service = {
        type = "ClusterIP" # 외부 노출은 ALB Ingress 별도
      }
    }
    prometheus = {
      prometheusSpec = {
        retention = "7d" # 데모 데이터 보관 짧게
        resources = {
          requests = { cpu = "200m", memory = "1Gi" }
          limits   = { memory = "2Gi" }
        }
        # ServiceMonitor 자동 발견 (Argo Rollouts metrics 등)
        serviceMonitorSelectorNilUsesHelmValues = false
      }
    }
    alertmanager = {
      enabled = true
    }
  })]
}

################################################################################
# Argo Rollouts (Canary 배포 전략)
################################################################################

resource "helm_release" "argo_rollouts" {
  namespace        = "argo-rollouts"
  create_namespace = true
  name             = "argo-rollouts"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-rollouts"
  version          = var.argo_rollouts_version

  values = [yamlencode({
    dashboard = {
      enabled = true
      service = {
        type = "ClusterIP"
      }
    }
  })]
}
