# Bootstrap

Terraform state backend (S3 + DynamoDB)를 만드는 1회성 모듈.

## 실행

```bash
cd bootstrap
terraform init
terraform apply
```

## 출력

apply 끝나면 `backend_config_snippet` output을 확인하고 그대로 복사해서 `envs/dev/backend.tf`에 붙여넣는다.

```bash
terraform output -raw backend_config_snippet > ../envs/dev/backend.tf
```

## 주의

- 이 디렉토리의 `.terraform/`, `terraform.tfstate*`는 **git에 올리지 말 것**
- bucket은 `force_destroy = false`라 안에 객체 있으면 destroy 안 됨 (실수 방지용)
- 한 번 만든 후 거의 건드리지 않음
