data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  lambda_vpc_enabled        = length(var.lambda_vpc_subnet_ids) > 0 && length(var.lambda_vpc_security_group_ids) > 0
  public_context_secret_arn = var.public_context_secret_arn != null ? var.public_context_secret_arn : (var.public_context_secret_id != null ? "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.public_context_secret_id}-*" : null)
  lambda_alias_enabled      = var.enable_api && var.enable_lambda_alias
  lambda_integration_uri    = local.lambda_alias_enabled ? aws_lambda_alias.live[0].invoke_arn : (var.enable_api ? aws_lambda_function.api[0].invoke_arn : null)
  lambda_alarm_resource     = "${var.name_prefix}-revenue-api:${var.lambda_alias_name}"
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
    for_each = local.public_context_secret_arn != null ? [local.public_context_secret_arn] : []
    content {
      sid       = "ReadPublicContextSecret"
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
  publish       = var.enable_lambda_versioning || var.enable_lambda_alias || var.enable_codedeploy_canary
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
      var.aurora_cluster_endpoint != null ? { AURORA_CLUSTER_ENDPOINT = var.aurora_cluster_endpoint } : {},
      var.aurora_database_name != null ? { AURORA_DATABASE_NAME = var.aurora_database_name } : {},
      var.aurora_secret_arn != null ? { AURORA_PORT = tostring(var.aurora_port) } : {},
      var.cognito_user_pool_id != null ? { COGNITO_POOL_ID = var.cognito_user_pool_id } : {},
      var.public_context_secret_id != null ? { PUBLIC_CONTEXT_SECRET_ID = var.public_context_secret_id } : {},
      var.kma_default_nx != null ? { KMA_DEFAULT_NX = var.kma_default_nx } : {},
      var.kma_default_ny != null ? { KMA_DEFAULT_NY = var.kma_default_ny } : {},
      var.kma_api_base_url != null ? { KMA_API_BASE_URL = var.kma_api_base_url } : {},
      var.kma_forecast_endpoint != null ? { KMA_FORECAST_ENDPOINT = var.kma_forecast_endpoint } : {},
      var.kma_nowcast_endpoint != null ? { KMA_NOWCAST_ENDPOINT = var.kma_nowcast_endpoint } : {},
      var.seoul_open_data_base_url != null ? { SEOUL_OPEN_DATA_BASE_URL = var.seoul_open_data_base_url } : {},
      var.seoul_commercial_sales_endpoint != null ? { SEOUL_COMMERCIAL_SALES_ENDPOINT = var.seoul_commercial_sales_endpoint } : {},
      var.seoul_foot_traffic_endpoint != null ? { SEOUL_FOOT_TRAFFIC_ENDPOINT = var.seoul_foot_traffic_endpoint } : {},
      var.seoul_store_density_endpoint != null ? { SEOUL_STORE_DENSITY_ENDPOINT = var.seoul_store_density_endpoint } : {},
      var.bronze_bucket_name != null ? { BRONZE_BUCKET_NAME = var.bronze_bucket_name } : {},
    )
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api"
  })
}

resource "aws_lambda_alias" "live" {
  count = local.lambda_alias_enabled ? 1 : 0

  name             = var.lambda_alias_name
  description      = "Revenue Ops live traffic alias for API Gateway and CodeDeploy canary deployments."
  function_name    = aws_lambda_function.api[0].function_name
  function_version = var.lambda_alias_initial_version != null ? var.lambda_alias_initial_version : aws_lambda_function.api[0].version
}

resource "aws_apigatewayv2_api" "api" {
  count = var.enable_api ? 1 : 0

  name          = "${var.name_prefix}-revenue-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
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
  integration_uri        = local.lambda_integration_uri
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

resource "aws_apigatewayv2_route" "revenue_options" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "OPTIONS /api/v1/revenue/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "me" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "ANY /api/v1/me"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = var.enable_cognito_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito_authorizer ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "me_options" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "OPTIONS /api/v1/me"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "stores" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "ANY /api/v1/stores"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = var.enable_cognito_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito_authorizer ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "stores_options" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "OPTIONS /api/v1/stores"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "stores_proxy" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "ANY /api/v1/stores/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = var.enable_cognito_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito_authorizer ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "stores_proxy_options" {
  count = var.enable_api ? 1 : 0

  api_id             = aws_apigatewayv2_api.api[0].id
  route_key          = "OPTIONS /api/v1/stores/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda[0].id}"
  authorization_type = "NONE"
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
  qualifier     = local.lambda_alias_enabled ? var.lambda_alias_name : null
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api[0].execution_arn}/*/*"
}

data "aws_iam_policy_document" "codedeploy_lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codedeploy.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codedeploy_lambda" {
  count = var.enable_api && var.enable_codedeploy_canary ? 1 : 0

  name               = "${var.name_prefix}-revenue-api-codedeploy"
  assume_role_policy = data.aws_iam_policy_document.codedeploy_lambda_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-codedeploy"
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy_lambda" {
  count = var.enable_api && var.enable_codedeploy_canary ? 1 : 0

  role       = aws_iam_role.codedeploy_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSCodeDeployRoleForLambda"
}

resource "aws_cloudwatch_metric_alarm" "lambda_alias_errors" {
  count = local.lambda_alias_enabled && var.enable_codedeploy_canary ? 1 : 0

  alarm_name          = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-errors"
  alarm_description   = "Revenue Ops API Lambda alias reported errors during live/canary traffic."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = var.lambda_error_alarm_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.api[0].function_name
    Resource     = local.lambda_alarm_resource
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-errors"
  })
}

resource "aws_cloudwatch_metric_alarm" "lambda_alias_throttles" {
  count = local.lambda_alias_enabled && var.enable_codedeploy_canary ? 1 : 0

  alarm_name          = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-throttles"
  alarm_description   = "Revenue Ops API Lambda alias throttled invocations."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = var.lambda_throttle_alarm_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.api[0].function_name
    Resource     = local.lambda_alarm_resource
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-throttles"
  })
}

resource "aws_cloudwatch_metric_alarm" "lambda_alias_duration_p95" {
  count = local.lambda_alias_enabled && var.enable_codedeploy_canary ? 1 : 0

  alarm_name          = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-duration-p95"
  alarm_description   = "Revenue Ops API Lambda alias p95 duration is elevated."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  extended_statistic  = "p95"
  threshold           = var.lambda_duration_p95_alarm_threshold_ms
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    FunctionName = aws_lambda_function.api[0].function_name
    Resource     = local.lambda_alarm_resource
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}-duration-p95"
  })
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  count = var.enable_api && var.enable_codedeploy_canary ? 1 : 0

  alarm_name          = "${var.name_prefix}-revenue-api-gateway-5xx-canary"
  alarm_description   = "Revenue Ops API Gateway returned 5xx responses during live/canary traffic."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = var.api_gateway_5xx_alarm_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ApiId = aws_apigatewayv2_api.api[0].id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-gateway-5xx-canary"
  })
}

resource "aws_codedeploy_app" "lambda" {
  count = var.enable_api && var.enable_codedeploy_canary ? 1 : 0

  compute_platform = "Lambda"
  name             = "${var.name_prefix}-revenue-api"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api"
  })
}

resource "aws_codedeploy_deployment_group" "lambda_live" {
  count = local.lambda_alias_enabled && var.enable_codedeploy_canary ? 1 : 0

  app_name               = aws_codedeploy_app.lambda[0].name
  deployment_group_name  = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}"
  service_role_arn       = aws_iam_role.codedeploy_lambda[0].arn
  deployment_config_name = var.codedeploy_deployment_config_name

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  auto_rollback_configuration {
    enabled = true
    events = [
      "DEPLOYMENT_FAILURE",
      "DEPLOYMENT_STOP_ON_ALARM",
      "DEPLOYMENT_STOP_ON_REQUEST",
    ]
  }

  alarm_configuration {
    enabled = true
    alarms = [
      aws_cloudwatch_metric_alarm.lambda_alias_errors[0].alarm_name,
      aws_cloudwatch_metric_alarm.lambda_alias_throttles[0].alarm_name,
      aws_cloudwatch_metric_alarm.lambda_alias_duration_p95[0].alarm_name,
      aws_cloudwatch_metric_alarm.api_gateway_5xx[0].alarm_name,
    ]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-revenue-api-${var.lambda_alias_name}"
  })

  depends_on = [
    aws_iam_role_policy_attachment.codedeploy_lambda,
    aws_lambda_alias.live,
  ]
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
