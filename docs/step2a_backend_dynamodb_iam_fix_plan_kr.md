# STEP 2-A Backend DynamoDB IAM Fix Plan

## 1. 목적

`revenue-ops-tflock` DynamoDB lock table 생성에 필요한 최소한의 IAM inline policy 변경을 준비하고 적용한다.

Hard stop:

- productops 리소스 및 권한 수정/삭제 금지
- IAM mutation은 explicit approval 후 실행
- revenue-dev terraform plan/apply 실행 금지

---

## 2. 현재 상태

| 항목 | 상태 |
|------|------|
| S3 bucket `revenue-ops-tfstate-827913617635` | ✅ 존재 (versioning/AES256/public block 완료) |
| DynamoDB `revenue-ops-tflock` | ❌ 미생성 (IAM 거부) |
| Bootstrap state serial | 7 (S3 리소스 5개 추적) |
| Productops resources | ✅ 영향 없음 |

---

## 3. 문제: IAM Resource 하드코딩

`de-ai-12`의 inline policy `TerraformDynamoDBLockTableAccess`의 현재 상태:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformDynamoDBLockTableBootstrapAndUse",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock"
    }
  ]
}
```

`Resource`가 `productops-tflock` ARN 하나로 고정되어 있어 `revenue-ops-tflock`에 대한 모든 DynamoDB 작업이 거부된다.

---

## 4. 제안하는 최소 패치

변경 사항: **Action 변경 없음. Resource만 배열로 확장.**

```diff
-"Resource": "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock"
+"Resource": [
+  "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock",
+  "arn:aws:dynamodb:ap-northeast-2:827913617635:table/revenue-ops-tflock"
+]
```

### 패치 후 전체 정책

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformDynamoDBLockTableBootstrapAndUse",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock",
        "arn:aws:dynamodb:ap-northeast-2:827913617635:table/revenue-ops-tflock"
      ]
    }
  ]
}
```

### 변경 영향 범위

| 항목 | 변경 여부 |
|------|-----------|
| 적용 Action 목록 | 변경 없음 |
| `productops-tflock` 권한 | 변경 없음 (기존 ARN 유지) |
| 신규 허용 리소스 | `revenue-ops-tflock` ARN 1개 추가 |
| 와일드카드 (`*`) 사용 | 없음 |
| 다른 DynamoDB 테이블 영향 | 없음 |

---

## 5. Approval Gate

아래 명시적 승인 없이는 IAM 정책을 수정하지 않는다:

```text
"Approved to update TerraformDynamoDBLockTableAccess to add revenue-ops-tflock ARN."
```

---

## 6. 승인 후 실행할 명령

### 6-1. IAM 정책 업데이트

```bash
aws iam put-user-policy \
  --user-name de-ai-12 \
  --policy-name TerraformDynamoDBLockTableAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "TerraformDynamoDBLockTableBootstrapAndUse",
        "Effect": "Allow",
        "Action": [
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:UpdateTable",
          "dynamodb:DeleteTable",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:ListTagsOfResource",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ],
        "Resource": [
          "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock",
          "arn:aws:dynamodb:ap-northeast-2:827913617635:table/revenue-ops-tflock"
        ]
      }
    ]
  }'
```

### 6-2. 정책 검증 (read-only)

```bash
aws iam get-user-policy \
  --user-name de-ai-12 \
  --policy-name TerraformDynamoDBLockTableAccess
```

### 6-3. Bootstrap 재실행 (DynamoDB만 추가)

이미 S3 리소스는 state에 있으므로 Terraform은 DynamoDB만 추가 생성한다:

```bash
cd infra/terraform/bootstrap

terraform apply \
  -state=revenue-ops-bootstrap.tfstate \
  -state-out=revenue-ops-bootstrap.tfstate \
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -var='aws_region=ap-northeast-2' \
  -var='tags={"Project":"revenue-ops","ManagedBy":"terraform","Purpose":"tf-state-backend","Contact":"joophila@naver.com"}' \
  -auto-approve \
  -no-color
```

예상 plan: 1 to add (aws_dynamodb_table.tflock), 0 to change, 0 to destroy.

### 6-4. 검증

```bash
# DynamoDB table 존재 확인
aws dynamodb describe-table \
  --table-name revenue-ops-tflock \
  --query 'Table.{Name:TableName,Status:TableStatus,BillingMode:BillingModeSummary.BillingMode}' \
  --output table

# S3 bucket 여전히 존재 확인
aws s3api head-bucket --bucket revenue-ops-tfstate-827913617635

# productops 리소스 영향 없음 확인
aws s3api head-bucket --bucket productops-tfstate-b68d831a
aws dynamodb describe-table \
  --table-name productops-tflock \
  --query 'Table.TableStatus' --output text
```

---

## 7. 이 변경이 안전한 이유

1. **최소 권한 원칙 유지**: Action 목록 변경 없음. 기존 11개 DynamoDB 액션만 유지.
2. **Productops 권한 유지**: `productops-tflock` ARN은 그대로 보존.
3. **와일드카드 없음**: `*` 대신 정확한 ARN 2개만 지정.
4. **단일 목적**: 새 ARN은 오직 revenue-ops Terraform state locking 용도.
5. **Blast radius**: 이 테이블에 대한 권한 확장은 bootstrap과 revenue-dev apply가 완료된 후 lock table로만 사용됨. 추가적인 data exposure 없음.

---

## 8. 변경된 파일 (이 단계)

```
docs/
  step2a_backend_dynamodb_iam_fix_plan_kr.md  # 이 문서
```

IAM 정책 변경은 코드 파일이 아니므로 git에 반영되지 않는다.
Bootstrap tfstate/tfplan은 gitignored.

---

## 9. 권장 커밋 명령 (docs only)

```bash
git add docs/step2a_backend_dynamodb_iam_fix_plan_kr.md

git commit -m "docs: add STEP 2-A DynamoDB IAM fix plan for revenue-ops-tflock"
```
