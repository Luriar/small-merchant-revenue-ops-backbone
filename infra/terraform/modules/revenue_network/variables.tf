variable "enable_network" {
  type        = bool
  default     = false
  description = "Enable the dedicated Revenue Ops Aurora network foundation."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the dedicated Revenue Ops VPC."
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "Private isolated subnet CIDRs for Aurora."

  validation {
    condition     = length(var.private_subnet_cidrs) >= 2
    error_message = "At least two private subnet CIDRs are required."
  }
}

variable "availability_zones" {
  type        = list(string)
  default     = []
  description = "Optional explicit AZ names. Defaults to the first available AZs in the configured region."

  validation {
    condition     = length(var.availability_zones) == 0 || length(var.availability_zones) >= 2
    error_message = "Provide at least two availability zones, or leave the list empty."
  }
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all network resources."
}
