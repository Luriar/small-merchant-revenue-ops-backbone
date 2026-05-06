data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  count = var.enable_network && length(var.availability_zones) == 0 ? 1 : 0

  state = "available"
}

data "aws_vpc_endpoint_service" "secretsmanager" {
  count = var.enable_network ? 1 : 0

  service = "secretsmanager"
}

locals {
  selected_availability_zones = !var.enable_network ? [] : (
    length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available[0].names, 0, length(var.private_subnet_cidrs))
  )
}

resource "aws_vpc" "main" {
  count = var.enable_network ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-aurora-network"
    Purpose = "revenue-ops-aurora-network"
  })
}

resource "aws_subnet" "private" {
  for_each = var.enable_network ? {
    for index, cidr in var.private_subnet_cidrs : tostring(index) => {
      cidr = cidr
      az   = local.selected_availability_zones[index]
    }
  } : {}

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-aurora-private-${tonumber(each.key) + 1}"
    Purpose = "revenue-ops-aurora-private-subnet"
    Tier    = "private"
  })
}

resource "aws_route_table" "private" {
  count = var.enable_network ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-aurora-private"
    Purpose = "revenue-ops-isolated-private-routes"
  })
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[0].id
}

resource "aws_security_group" "lambda" {
  count = var.enable_network ? 1 : 0

  name        = "${var.name_prefix}-lambda-aurora-access"
  description = "Future Lambda runtime access to Revenue Ops Aurora."
  vpc_id      = aws_vpc.main[0].id

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-lambda-aurora-access"
    Purpose = "revenue-ops-lambda-to-aurora"
  })
}

resource "aws_security_group" "aurora" {
  count = var.enable_network ? 1 : 0

  name        = "${var.name_prefix}-aurora-network"
  description = "Aurora PostgreSQL access for Revenue Ops."
  vpc_id      = aws_vpc.main[0].id

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-aurora-network"
    Purpose = "revenue-ops-aurora"
  })
}

resource "aws_security_group_rule" "lambda_to_aurora_egress" {
  count = var.enable_network ? 1 : 0

  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.lambda[0].id
  source_security_group_id = aws_security_group.aurora[0].id
  description              = "Allow Lambda security group to reach Aurora PostgreSQL."
}

resource "aws_security_group_rule" "aurora_from_lambda_ingress" {
  count = var.enable_network ? 1 : 0

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.aurora[0].id
  source_security_group_id = aws_security_group.lambda[0].id
  description              = "Allow PostgreSQL only from Revenue Ops Lambda security group."
}


resource "aws_security_group" "vpc_endpoint" {
  count = var.enable_network ? 1 : 0

  name        = "${var.name_prefix}-vpc-endpoints"
  description = "Private AWS service endpoint access for Revenue Ops Lambda."
  vpc_id      = aws_vpc.main[0].id

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-vpc-endpoints"
    Purpose = "revenue-ops-private-aws-endpoints"
  })
}

resource "aws_security_group_rule" "lambda_to_vpc_endpoint_egress" {
  count = var.enable_network ? 1 : 0

  type                     = "egress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.lambda[0].id
  source_security_group_id = aws_security_group.vpc_endpoint[0].id
  description              = "Allow Lambda security group to reach interface VPC endpoints over HTTPS."
}

resource "aws_security_group_rule" "vpc_endpoint_from_lambda_ingress" {
  count = var.enable_network ? 1 : 0

  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.vpc_endpoint[0].id
  source_security_group_id = aws_security_group.lambda[0].id
  description              = "Allow HTTPS from Revenue Ops Lambda security group."
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count = var.enable_network ? 1 : 0

  vpc_id              = aws_vpc.main[0].id
  service_name        = data.aws_vpc_endpoint_service.secretsmanager[0].service_name
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpc_endpoint[0].id]

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-secretsmanager-endpoint"
    Purpose = "revenue-ops-private-secretsmanager"
  })
}

resource "aws_vpc_endpoint" "s3" {
  count = var.enable_network ? 1 : 0

  vpc_id            = aws_vpc.main[0].id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private[0].id]

  tags = merge(var.tags, {
    Name    = "${var.name_prefix}-s3-endpoint"
    Purpose = "revenue-ops-private-s3"
  })
}

resource "aws_security_group_rule" "lambda_to_s3_egress" {
  count = var.enable_network ? 1 : 0

  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.lambda[0].id
  prefix_list_ids   = [aws_vpc_endpoint.s3[0].prefix_list_id]
  description       = "Allow Lambda security group to reach S3 through the gateway endpoint prefix list."
}
