terraform {
  backend "s3" {
    # Configure via -backend-config flags or terraform.tfvars
    # bucket         = "your-tfstate-bucket"
    # key            = "revenue-ops/revenue-dev/terraform.tfstate"
    # region         = "ap-northeast-2"
    # dynamodb_table = "your-tfstate-lock-table"
    # encrypt        = true
  }
}
