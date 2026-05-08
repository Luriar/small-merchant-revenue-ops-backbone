resource "aws_cognito_user_pool" "main" {
  count = var.enable_auth ? 1 : 0

  name = "${var.name_prefix}-users"

  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = !var.enable_self_signup
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-users"
  })
}

resource "aws_cognito_user_pool_client" "web" {
  count = var.enable_auth ? 1 : 0

  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.main[0].id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  # SPA popover uses InitiateAuth (USER_PASSWORD_AUTH) directly against the
  # regional Cognito IDP endpoint. SRP and refresh-token flows stay enabled so
  # SDK upgrades and silent refresh remain possible without another patch.
  explicit_auth_flows = compact([
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    var.enable_user_password_auth ? "ALLOW_USER_PASSWORD_AUTH" : "",
  ])

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  count = var.enable_auth && var.domain_prefix != null ? 1 : 0

  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.main[0].id
}
