################################################################################
# Network module
#
# - VPC
# - 6 subnets (public 2 / private app 2 / private db 2)
# - Internet Gateway
# - Route tables (public + private)
#
# NAT Gateway는 M2에서 추가 (이 파일 하단 주석 블록 참조).
#
# Subnet CIDR 자동 계산:
#   /20 VPC 안에서 cidrsubnet()으로 분할
#   - public a/b: /24 (256 IP)
#   - private app a/b: /22 (1024 IP)
#   - private db a/b: /24 (256 IP)
#
# Subnet tag (M2 호환성 유지):
#   - kubernetes.io/role/elb (public)
#   - kubernetes.io/role/internal-elb (private app)
#   - kubernetes.io/cluster/{name} = shared (public + private app)
#   - karpenter.sh/discovery (private app)
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

################################################################################
# Locals — subnet CIDR 자동 분할
################################################################################

locals {
  # /20 VPC를 가정. 다른 prefix면 newbits 수동 조정 필요.
  # cidrsubnet(prefix, newbits, netnum)
  public_subnet_a_cidr      = cidrsubnet(var.vpc_cidr, 4, 0)  # x.x.0.0/24
  public_subnet_b_cidr      = cidrsubnet(var.vpc_cidr, 4, 1)  # x.x.1.0/24
  private_app_subnet_a_cidr = cidrsubnet(var.vpc_cidr, 2, 1)  # x.x.4.0/22
  private_app_subnet_b_cidr = cidrsubnet(var.vpc_cidr, 2, 2)  # x.x.8.0/22
  private_db_subnet_a_cidr  = cidrsubnet(var.vpc_cidr, 4, 12) # x.x.12.0/24
  private_db_subnet_b_cidr  = cidrsubnet(var.vpc_cidr, 4, 13) # x.x.13.0/24

  # M2 EKS 자동 발견 tag (M1에선 의미 없으나 M2 마이그레이션 회피용)
  eks_cluster_name = "${var.project_name}-eks"
}

################################################################################
# VPC
################################################################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${var.project_name}-vpc"
  })
}

################################################################################
# Internet Gateway
################################################################################

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-igw"
  })
}

################################################################################
# Public subnets (a, b)
################################################################################

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_a_cidr
  availability_zone       = var.azs[0]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name                                              = "${var.project_name}-public-a"
    "kubernetes.io/role/elb"                          = "1"
    "kubernetes.io/cluster/${local.eks_cluster_name}" = "shared"
  })
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_b_cidr
  availability_zone       = var.azs[1]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name                                              = "${var.project_name}-public-b"
    "kubernetes.io/role/elb"                          = "1"
    "kubernetes.io/cluster/${local.eks_cluster_name}" = "shared"
  })
}

################################################################################
# Private app subnets (a, b)
################################################################################

resource "aws_subnet" "private_app_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.private_app_subnet_a_cidr
  availability_zone       = var.azs[0]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name                                              = "${var.project_name}-private-app-a"
    "kubernetes.io/role/internal-elb"                 = "1"
    "kubernetes.io/cluster/${local.eks_cluster_name}" = "shared"
    "karpenter.sh/discovery"                          = local.eks_cluster_name
  })
}

resource "aws_subnet" "private_app_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.private_app_subnet_b_cidr
  availability_zone       = var.azs[1]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name                                              = "${var.project_name}-private-app-b"
    "kubernetes.io/role/internal-elb"                 = "1"
    "kubernetes.io/cluster/${local.eks_cluster_name}" = "shared"
    "karpenter.sh/discovery"                          = local.eks_cluster_name
  })
}

################################################################################
# Private DB subnets (a, b)
################################################################################

resource "aws_subnet" "private_db_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.private_db_subnet_a_cidr
  availability_zone       = var.azs[0]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-db-a"
  })
}

resource "aws_subnet" "private_db_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.private_db_subnet_b_cidr
  availability_zone       = var.azs[1]
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-db-b"
  })
}

################################################################################
# Route tables
################################################################################

# Public RT
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-public-rt"
  })
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# Private app RT (AZ별 분리 — M2 NAT 추가 시 AZ별 NAT 가능하도록)
resource "aws_route_table" "private_app_a" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-app-rt-a"
  })
}

resource "aws_route_table" "private_app_b" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-app-rt-b"
  })
}

resource "aws_route_table_association" "private_app_a" {
  subnet_id      = aws_subnet.private_app_a.id
  route_table_id = aws_route_table.private_app_a.id
}

resource "aws_route_table_association" "private_app_b" {
  subnet_id      = aws_subnet.private_app_b.id
  route_table_id = aws_route_table.private_app_b.id
}

# Private DB RT (인터넷 outbound 절대 없음)
resource "aws_route_table" "private_db_a" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-db-rt-a"
  })
}

resource "aws_route_table" "private_db_b" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name = "${var.project_name}-private-db-rt-b"
  })
}

resource "aws_route_table_association" "private_db_a" {
  subnet_id      = aws_subnet.private_db_a.id
  route_table_id = aws_route_table.private_db_a.id
}

resource "aws_route_table_association" "private_db_b" {
  subnet_id      = aws_subnet.private_db_b.id
  route_table_id = aws_route_table.private_db_b.id
}

################################################################################
# NAT Gateway — M2 활성화
#
# var.enable_nat_gateway = true 면 NAT 2개 생성 (AZ별).
# false면 NAT 없음 (M1 모드).
#
# 비용: NAT GW $0.045/hour × 2 = 약 $65/월 (ap-northeast-2)
################################################################################

resource "aws_eip" "nat_a" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"
  tags = merge(var.tags, {
    Name = "${var.project_name}-nat-eip-a"
  })
}

resource "aws_eip" "nat_b" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"
  tags = merge(var.tags, {
    Name = "${var.project_name}-nat-eip-b"
  })
}

resource "aws_nat_gateway" "a" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat_a[0].id
  subnet_id     = aws_subnet.public_a.id
  tags = merge(var.tags, {
    Name = "${var.project_name}-nat-a"
  })
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "b" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat_b[0].id
  subnet_id     = aws_subnet.public_b.id
  tags = merge(var.tags, {
    Name = "${var.project_name}-nat-b"
  })
  depends_on = [aws_internet_gateway.main]
}

resource "aws_route" "private_app_a_default" {
  count                  = var.enable_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private_app_a.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.a[0].id
}

resource "aws_route" "private_app_b_default" {
  count                  = var.enable_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private_app_b.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.b[0].id
}
