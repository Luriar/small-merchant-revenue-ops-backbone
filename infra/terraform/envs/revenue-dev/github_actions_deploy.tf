data "aws_caller_identity" "github_actions_deploy" {}
data "aws_partition" "github_actions_deploy" {}
data "aws_region" "github_actions_deploy" {}

data "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_actions_repo_full_name = "Luriar/small-merchant-revenue-ops-backbone"

  revenue_dev_name_prefix             = "revenue-ops-revenue-dev"
  revenue_dev_environment             = "revenue-dev"
  revenue_dev_frontend_bucket_name    = "revenue-ops-frontend-dev-827913617635"
  revenue_dev_artifact_bucket_name    = "revenue-ops-artifacts-dev-827913617635"
  revenue_dev_cloudfront_distribution = "E31KH7PFML1A6N"
  revenue_dev_lambda_function_name    = "revenue-ops-revenue-dev-revenue-api"
  revenue_dev_codedeploy_app_name     = "revenue-ops-revenue-dev-revenue-api"
  revenue_dev_codedeploy_group_name   = "revenue-ops-revenue-dev-revenue-api-live"
}

data "aws_iam_policy_document" "github_actions_deploy_assume_role" {
  statement {
    sid     = "AllowGitHubActionsOidcAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_actions_repo_full_name}:ref:refs/heads/main",
        "repo:${local.github_actions_repo_full_name}:environment:${local.revenue_dev_environment}",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_revenue_dev_deploy" {
  name               = "${local.revenue_dev_name_prefix}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_deploy_assume_role.json

  tags = {
    Name        = "${local.revenue_dev_name_prefix}-github-actions-deploy"
    Environment = local.revenue_dev_environment
    ManagedBy   = "terraform"
  }
}

data "aws_iam_policy_document" "github_actions_revenue_dev_deploy" {
  statement {
    sid    = "AllowFrontendBucketList"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:s3:::${local.revenue_dev_frontend_bucket_name}",
    ]
  }

  statement {
    sid    = "AllowFrontendObjectDeploy"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:s3:::${local.revenue_dev_frontend_bucket_name}/*",
    ]
  }

  statement {
    sid    = "AllowCloudFrontInvalidation"
    effect = "Allow"

    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:GetDistribution",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:cloudfront::${data.aws_caller_identity.github_actions_deploy.account_id}:distribution/${local.revenue_dev_cloudfront_distribution}",
    ]
  }

  statement {
    sid    = "AllowArtifactBucketList"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:s3:::${local.revenue_dev_artifact_bucket_name}",
    ]
  }

  statement {
    sid    = "AllowArtifactObjectReadWrite"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:s3:::${local.revenue_dev_artifact_bucket_name}/api-packages/*",
    ]
  }

  statement {
    sid    = "AllowRevenueApiLambdaCanaryDeploy"
    effect = "Allow"

    actions = [
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:PublishVersion",
      "lambda:GetAlias",
      "lambda:UpdateAlias",
      "lambda:ListVersionsByFunction",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:lambda:${data.aws_region.github_actions_deploy.name}:${data.aws_caller_identity.github_actions_deploy.account_id}:function:${local.revenue_dev_lambda_function_name}",
      "arn:${data.aws_partition.github_actions_deploy.partition}:lambda:${data.aws_region.github_actions_deploy.name}:${data.aws_caller_identity.github_actions_deploy.account_id}:function:${local.revenue_dev_lambda_function_name}:*",
    ]
  }

  statement {
    sid    = "AllowRevenueApiCodeDeployCanary"
    effect = "Allow"

    actions = [
      "codedeploy:GetApplication",
      "codedeploy:GetDeployment",
      "codedeploy:GetDeploymentConfig",
      "codedeploy:GetDeploymentGroup",
      "codedeploy:CreateDeployment",
      "codedeploy:RegisterApplicationRevision",
    ]

    resources = [
      "arn:${data.aws_partition.github_actions_deploy.partition}:codedeploy:${data.aws_region.github_actions_deploy.name}:${data.aws_caller_identity.github_actions_deploy.account_id}:application:${local.revenue_dev_codedeploy_app_name}",
      "arn:${data.aws_partition.github_actions_deploy.partition}:codedeploy:${data.aws_region.github_actions_deploy.name}:${data.aws_caller_identity.github_actions_deploy.account_id}:deploymentgroup:${local.revenue_dev_codedeploy_app_name}/${local.revenue_dev_codedeploy_group_name}",
      "arn:${data.aws_partition.github_actions_deploy.partition}:codedeploy:${data.aws_region.github_actions_deploy.name}:${data.aws_caller_identity.github_actions_deploy.account_id}:deploymentconfig:*",
    ]
  }

  statement {
    sid       = "AllowDeploymentAlarmRead"
    effect    = "Allow"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_actions_revenue_dev_deploy" {
  name        = "${local.revenue_dev_name_prefix}-github-actions-deploy"
  description = "Deploy policy for Revenue OS GitHub Actions in revenue-dev."
  policy      = data.aws_iam_policy_document.github_actions_revenue_dev_deploy.json

  tags = {
    Name        = "${local.revenue_dev_name_prefix}-github-actions-deploy"
    Environment = local.revenue_dev_environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "github_actions_revenue_dev_deploy" {
  role       = aws_iam_role.github_actions_revenue_dev_deploy.name
  policy_arn = aws_iam_policy.github_actions_revenue_dev_deploy.arn
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions manual deploy workflow."
  value       = aws_iam_role.github_actions_revenue_dev_deploy.arn
}
