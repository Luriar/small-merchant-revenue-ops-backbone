################################################################################
# Argo CD Module
#
# 별도 모듈인 이유: bootstrap 우선순위. Argo CD가 먼저 떠야 GitOps로 다른 앱 배포 가능.
# (실제로는 helm_addons도 비슷하게 의존성 있어 envs/dev에서 순서 제어)
#
# Argo CD 자체는 Helm으로 설치. 이후 Application CRD로 GitOps 관리.
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}

resource "helm_release" "argocd" {
  namespace        = "argocd"
  create_namespace = true
  name             = "argo-cd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_version

  values = [yamlencode({
    server = {
      service = {
        type = "ClusterIP" # 외부 노출은 ALB Ingress로 별도
      }
      extraArgs = ["--insecure"] # ALB가 TLS 종료하므로 backend는 HTTP
    }
    configs = {
      params = {
        "server.insecure" = "true"
      }
    }
    # 리소스 (데모 사이즈)
    controller = {
      resources = {
        requests = { cpu = "100m", memory = "256Mi" }
        limits   = { memory = "512Mi" }
      }
    }
    repoServer = {
      resources = {
        requests = { cpu = "50m", memory = "128Mi" }
        limits   = { memory = "256Mi" }
      }
    }
    applicationSet = {
      enabled = true
    }
    notifications = {
      enabled = false # v1
    }
  })]
}
