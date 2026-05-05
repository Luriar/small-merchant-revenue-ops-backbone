locals {
  frontend_origin_id = "${var.name_prefix}-frontend-origin"
}

resource "aws_s3_bucket" "frontend" {
  count = var.enable_frontend ? 1 : 0

  bucket        = var.frontend_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name    = var.frontend_bucket_name
    Purpose = "revenue-ops-frontend"
  })
}

resource "aws_s3_bucket_versioning" "frontend" {
  count = var.enable_frontend ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  count = var.enable_frontend ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  count = var.enable_frontend ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count = var.enable_frontend ? 1 : 0

  name                              = "${var.name_prefix}-frontend-oac"
  description                       = "OAC for private small-merchant Revenue Ops frontend S3 origin."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  count = var.enable_frontend ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name_prefix} frontend"
  default_root_object = "index.html"
  aliases             = var.domain_aliases
  price_class         = var.price_class

  origin {
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_id                = local.frontend_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.frontend_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = length(var.domain_aliases) == 0
    acm_certificate_arn            = length(var.domain_aliases) > 0 ? var.acm_certificate_arn : null
    ssl_support_method             = length(var.domain_aliases) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.domain_aliases) > 0 ? "TLSv1.2_2021" : null
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-frontend"
  })
}

data "aws_iam_policy_document" "frontend_bucket_policy" {
  count = var.enable_frontend ? 1 : 0

  statement {
    sid     = "AllowCloudFrontRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    resources = ["${aws_s3_bucket.frontend[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  count = var.enable_frontend ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id
  policy = data.aws_iam_policy_document.frontend_bucket_policy[0].json
}

resource "aws_route53_record" "frontend_alias" {
  for_each = var.enable_frontend && var.create_dns_records ? toset(var.domain_aliases) : toset([])

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend[0].domain_name
    zone_id                = aws_cloudfront_distribution.frontend[0].hosted_zone_id
    evaluate_target_health = false
  }
}
