#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-revenue-ops-revenue-dev-revenue-api}"
PUBLIC_CONTEXT_SECRET_ID="${PUBLIC_CONTEXT_SECRET_ID:-/revenue-ops/revenue-dev/external/public-context}"

section() {
  printf "\n==== %s ====\n" "$1"
}

run_soft() {
  "$@" || {
    code=$?
    echo "[warn] command failed with exit ${code}: $*" >&2
    return 0
  }
}

aws_region() {
  aws --region "${REGION}" "$@"
}

section "Caller identity"
run_soft aws sts get-caller-identity --output table

section "Lambda function summary: ${LAMBDA_FUNCTION_NAME}"
run_soft aws_region lambda get-function-configuration \
  --function-name "${LAMBDA_FUNCTION_NAME}" \
  --output json \
  | jq '{
      FunctionName,
      Runtime,
      Handler,
      MemorySize,
      Timeout,
      LastModified,
      State,
      LastUpdateStatus,
      Role,
      LogGroup: (.LoggingConfig.LogGroup // null)
    }'

section "Lambda aliases"
run_soft aws_region lambda list-aliases \
  --function-name "${LAMBDA_FUNCTION_NAME}" \
  --output json \
  | jq '.Aliases[]? | {Name, FunctionVersion, Description}'

section "CloudWatch log groups related to revenue-ops"
run_soft aws_region logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/revenue-ops" \
  --output json \
  | jq '.logGroups[]? | {logGroupName, storedBytes, retentionInDays}'

section "REST API Gateway APIs containing revenue"
run_soft aws_region apigateway get-rest-apis \
  --output json \
  | jq '.items[]? | select((.name // "" | test("revenue"; "i"))) | {id, name, createdDate}'

section "HTTP/WebSocket API Gateway v2 APIs containing revenue"
run_soft aws_region apigatewayv2 get-apis \
  --output json \
  | jq '.Items[]? | select((.Name // "" | test("revenue"; "i"))) | {ApiId, Name, ProtocolType, ApiEndpoint}'

section "Public context secret existence"
run_soft aws_region secretsmanager describe-secret \
  --secret-id "${PUBLIC_CONTEXT_SECRET_ID}" \
  --output json \
  | jq '{Name, ARN, LastChangedDate, LastAccessedDate}'

section "Cognito user pools containing revenue"
run_soft aws_region cognito-idp list-user-pools \
  --max-results 60 \
  --output json \
  | jq '.UserPools[]? | select((.Name // "" | test("revenue"; "i"))) | {Id, Name, Status, LastModifiedDate}'

section "CloudFront distributions containing revenue"
run_soft aws cloudfront list-distributions \
  --output json \
  | jq '.DistributionList.Items[]? 
    | select(
        (.Comment // "" | test("revenue"; "i")) 
        or (([.Origins.Items[]?.DomainName] | join(",")) | test("revenue"; "i"))
      ) 
    | {Id, DomainName, Enabled, Status, Comment}'

section "Done"
echo "Inventory is read-only. No secret values were printed."
