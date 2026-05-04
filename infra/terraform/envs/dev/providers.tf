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
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
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

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "dev"
      ManagedBy   = "terraform"
      Milestone   = var.enable_m2 ? "M2" : "M1"
    }
  }
}

# kubernetes / helm provider — EKS cluster auth 사용
data "aws_eks_cluster_auth" "main" {
  count = var.enable_m2 ? 1 : 0
  name  = module.eks[0].cluster_name
}

provider "kubernetes" {
  host                   = var.enable_m2 ? module.eks[0].cluster_endpoint : ""
  cluster_ca_certificate = var.enable_m2 ? base64decode(module.eks[0].cluster_certificate_authority_data) : ""
  token                  = var.enable_m2 ? data.aws_eks_cluster_auth.main[0].token : ""
}

provider "helm" {
  kubernetes {
    host                   = var.enable_m2 ? module.eks[0].cluster_endpoint : ""
    cluster_ca_certificate = var.enable_m2 ? base64decode(module.eks[0].cluster_certificate_authority_data) : ""
    token                  = var.enable_m2 ? data.aws_eks_cluster_auth.main[0].token : ""
  }
}
