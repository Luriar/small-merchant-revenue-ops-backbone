data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  lambda_vpc_enabled = length(var.lambda_vpc_subnet_ids) > 0 && length(var.lambda_vpc_security_group_ids) > 0
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_lambda" {
  count = var.enable_api ? 1 : 0

  name               = "${var.name_prefix}-revenue-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api"
  })
}

data "aws_iam_policy_document" "api_lambda_permissions" {
  count = var.enable_api ? 1 : 0

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-revenue-api:*"]
  }

  dynamic "statement" {
    for_each = var.artifact_bucket_arn != null ? [var.artifact_bucket_arn] : []
    content {
      sid       = "ReadArtifacts"
      effect    = "Allow"
      actions   = ["s3:GetObject", "s3:ListBucket"]
      resources = [statement.value, "${statement.value}/*"]
    }
  }

  dynamic "statement" {
    for_each = var.aurora_secret_arn != null ? [var.aurora_secret_arn] : []
    content {
      sid       = "ReadAuroraSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = local.lambda_vpc_enabled ? [1] : []
    content {
      sid    = "LambdaVpcNetworkInterfaceAccess"
      effect = "Allow"
      actions = [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_xray ? [1] : []
    content {
      sid    = "XRayWrite"
      effect = "Allow"
      actions = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_policy" "api_lambda" {
  count = var.enable_api ? 1 : 0

  name   = "${var.name_prefix}-revenue-api-policy"
  policy = data.aws_iam_policy_document.api_lambda_permissions[0].json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "api_lambda" {
  count = var.enable_api ? 1 : 0

  role       = aws_iam_role.api_lambda[0].name
  policy_arn = aws_iam_policy.api_lambda[0].arn
}

resource "aws_lambda_function" "api" {
  count = var.enable_api ? 1 : 0

  function_name = "${var.name_prefix}-revenue-api"
  description   = "Small-merchant Revenue Ops API."
  role          = aws_iam_role.api_lambda[0].arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 30
  memory_size   = 512
  s3_bucket     = var.lambda_s3_bucket
  s3_key        = var.lambda_s3_key

  dynamic "vpc_config" {
    for_each = local.lambda_vpc_enabled ? [1] : []

    content {
      subnet_ids         = var.lambda_vpc_subnet_ids
      security_group_ids = var.lambda_vpc_security_group_ids
    }
  }

  environment {
    variables = merge(
      var.artifact_bucket_name != null ? { ARTIFACT_BUCKET = var.artifact_bucket_name } : {},
      var.aurora_secret_arn != null ? { AURORA_SECRET_ARN = var.aurora_secret_arn } : {},
      var.cognito_user_pool_id != null ? { COGNITO_POOL_ID = var.cognito_user_pool_id } : {},
    )
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api"
  })
}

resource "aws_apigatewayv2_api" "api" {
  count = var.enable_api ? 1 : 0

  name          = "${var.name_prefix}-revenue-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "PATCH", "OPTIONS"]
    allow_origins = ["https://*"]
    max_age       = 300
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api"
  })
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  count = var.enable_api && var.enable_cognito_authorizer ? 1 : 0

  api_id           = aws_apigatewayv2_api.api[0].id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.name_prefix}-cognito"

  jwt_configuration {
    audience = [var.cognito_user_pool_client_id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  count = var.enable_api ? 1 : 0

  api_id                 = aws_apigatewayv2_api.api[0].id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api[0].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "revenue" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "ANY /api/v1/revenue/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = var.enable_cognito_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito_authorizer ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_stage" "default" {
  count = var.enable_api ? 1 : 0

  api_id      = aws_apigatewayv2_api.api[0].id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  count = var.enable_api ? 1 : 0

  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api[0].execution_arn}/*/*"
}

resource "aws_apigatewayv2_domain_name" "api" {
  count = var.enable_api && var.custom_domain_name != null ? 1 : 0

  domain_name = var.custom_domain_name

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "api" {
  count = var.enable_api && var.custom_domain_name != null ? 1 : 0

  api_id      = aws_apigatewayv2_api.api[0].id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default[0].id
}

resource "aws_route53_record" "api" {
  count = var.enable_api && var.create_dns_record && var.custom_domain_name != null ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.custom_domain_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
