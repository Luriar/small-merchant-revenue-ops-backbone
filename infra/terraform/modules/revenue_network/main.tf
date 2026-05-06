data "aws_availability_zones" "available" {
  count = var.enable_network && length(var.availability_zones) == 0 ? 1 : 0

  state = "available"
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
