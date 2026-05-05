terraform {
  backend "s3" {
    bucket         = "revenue-ops-tfstate-827913617635"
    key            = "revenue-ops/revenue-dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "revenue-ops-tflock"
    encrypt        = true
  }
}
