variable "enable_auth" {
  type        = bool
  default     = false
  description = "Enable Cognito auth foundation."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "callback_urls" {
  type        = list(string)
  default     = []
  description = "Allowed callback URLs."
}

variable "logout_urls" {
  type        = list(string)
  default     = []
  description = "Allowed logout URLs."
}

variable "domain_prefix" {
  type        = string
  default     = null
  description = "Optional Cognito hosted UI domain prefix."
}

variable "frontend_urls" {
  type        = list(string)
  default     = []
  description = "Frontend hostnames for documentation and future callback derivation."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}

variable "enable_self_signup" {
  type        = bool
  default     = true
  description = "Allow self-service sign-up from the in-app auth popover (sets allow_admin_create_user_only to false)."
}

variable "enable_user_password_auth" {
  type        = bool
  default     = true
  description = "Allow ALLOW_USER_PASSWORD_AUTH on the public web app client so the SPA popover can call InitiateAuth directly without SRP."
}
