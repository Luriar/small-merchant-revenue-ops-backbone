terraform {
  backend "s3" {
    bucket         = "productops-tfstate-b68d831a"
    key            = "envs/dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "productops-tflock"
    encrypt        = true
  }
}
