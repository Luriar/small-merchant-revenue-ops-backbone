#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-revenue-ops-revenue-dev-revenue-api}"
HOURS="${HOURS:-3}"
PERIOD="${PERIOD:-300}"

END_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
START_TIME="$(date -u -d "${HOURS} hours ago" +"%Y-%m-%dT%H:%M:%SZ")"
START_MS="$(date -u -d "${HOURS} hours ago" +%s)000"

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

metric_sum() {
  local namespace="$1"
  local metric="$2"
  shift 2

  aws_region cloudwatch get-metric-statistics \
    --namespace "${namespace}" \
    --metric-name "${metric}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period "${PERIOD}" \
    --statistics Sum \
    "$@" \
    --output json \
    | jq -r '[.Datapoints[].Sum] | add // 0'
}

metric_avg_max() {
  local namespace="$1"
  local metric="$2"
  shift 2

  aws_region cloudwatch get-metric-statistics \
    --namespace "${namespace}" \
    --metric-name "${metric}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period "${PERIOD}" \
    --statistics Average Maximum \
    "$@" \
    --output json \
    | jq -r '{
        avg_max: ([.Datapoints[].Average] | max // 0),
        max: ([.Datapoints[].Maximum] | max // 0)
      }'
}

section "Metric preflight window"
echo "Region: ${REGION}"
echo "Start:  ${START_TIME}"
echo "End:    ${END_TIME}"
echo "Period: ${PERIOD}s"

section "Lambda metrics: ${LAMBDA_FUNCTION_NAME}"

echo "Invocations Sum:"
run_soft metric_sum AWS/Lambda Invocations \
  --dimensions "Name=FunctionName,Value=${LAMBDA_FUNCTION_NAME}"

echo "Errors Sum:"
run_soft metric_sum AWS/Lambda Errors \
  --dimensions "Name=FunctionName,Value=${LAMBDA_FUNCTION_NAME}"

echo "Throttles Sum:"
run_soft metric_sum AWS/Lambda Throttles \
  --dimensions "Name=FunctionName,Value=${LAMBDA_FUNCTION_NAME}"

echo "Duration Average/Maximum:"
run_soft metric_avg_max AWS/Lambda Duration \
  --dimensions "Name=FunctionName,Value=${LAMBDA_FUNCTION_NAME}"

section "Recent Lambda ERROR logs"
LOG_GROUP="/aws/lambda/${LAMBDA_FUNCTION_NAME}"
run_soft aws_region logs filter-log-events \
  --log-group-name "${LOG_GROUP}" \
  --start-time "${START_MS}" \
  --filter-pattern '?ERROR ?Error ?error ?Exception ?exception ?failed ?FAILED' \
  --max-items 50 \
  --output json \
  | jq '.events[]?
      | select((.message | contains("NodeVersionSupportWarning")) | not)
      | select((.message | contains("AWS SDK for JavaScript")) | not)
      | {timestamp, message}'

section "REST API Gateway discovery"
REST_API_JSON="$(aws_region apigateway get-rest-apis --output json 2>/dev/null | jq -c '.items[]? | select((.name // "" | test("revenue"; "i"))) | {id, name}' | head -n 1 || true)"

if [[ -n "${REST_API_JSON}" ]]; then
  REST_API_ID="$(echo "${REST_API_JSON}" | jq -r '.id')"
  REST_API_NAME="$(echo "${REST_API_JSON}" | jq -r '.name')"
  echo "REST API: ${REST_API_NAME} (${REST_API_ID})"

  STAGE_NAME="$(aws_region apigateway get-stages \
    --rest-api-id "${REST_API_ID}" \
    --output json 2>/dev/null \
    | jq -r '.item[0].stageName // empty' || true)"

  if [[ -n "${STAGE_NAME}" ]]; then
    echo "Stage: ${STAGE_NAME}"

    echo "API Count Sum:"
    run_soft metric_sum AWS/ApiGateway Count \
      --dimensions "Name=ApiName,Value=${REST_API_NAME}" "Name=Stage,Value=${STAGE_NAME}"

    echo "API 4XXError Sum:"
    run_soft metric_sum AWS/ApiGateway 4XXError \
      --dimensions "Name=ApiName,Value=${REST_API_NAME}" "Name=Stage,Value=${STAGE_NAME}"

    echo "API 5XXError Sum:"
    run_soft metric_sum AWS/ApiGateway 5XXError \
      --dimensions "Name=ApiName,Value=${REST_API_NAME}" "Name=Stage,Value=${STAGE_NAME}"

    echo "API Latency Average/Maximum:"
    run_soft metric_avg_max AWS/ApiGateway Latency \
      --dimensions "Name=ApiName,Value=${REST_API_NAME}" "Name=Stage,Value=${STAGE_NAME}"
  else
    echo "[warn] No REST API stage discovered."
  fi
else
  echo "[warn] No REST API containing revenue discovered."
fi

section "HTTP API Gateway v2 discovery"
HTTP_API_JSON="$(aws_region apigatewayv2 get-apis --output json 2>/dev/null | jq -c '.Items[]? | select((.Name // "" | test("revenue"; "i"))) | {ApiId, Name, ProtocolType}' | head -n 1 || true)"

if [[ -n "${HTTP_API_JSON}" ]]; then
  HTTP_API_ID="$(echo "${HTTP_API_JSON}" | jq -r '.ApiId')"
  HTTP_API_NAME="$(echo "${HTTP_API_JSON}" | jq -r '.Name')"
  echo "HTTP API: ${HTTP_API_NAME} (${HTTP_API_ID})"

  HTTP_STAGE="$(aws_region apigatewayv2 get-stages \
    --api-id "${HTTP_API_ID}" \
    --output json 2>/dev/null \
    | jq -r '.Items[0].StageName // empty' || true)"

  if [[ -n "${HTTP_STAGE}" ]]; then
    echo "HTTP API Stage: ${HTTP_STAGE}"
    echo "HTTP API Count Sum:"
    run_soft metric_sum AWS/ApiGateway Count \
      --dimensions "Name=ApiId,Value=${HTTP_API_ID}" "Name=Stage,Value=${HTTP_STAGE}"

    echo "HTTP API 4XXError Sum:"
    run_soft metric_sum AWS/ApiGateway 4XXError \
      --dimensions "Name=ApiId,Value=${HTTP_API_ID}" "Name=Stage,Value=${HTTP_STAGE}"

    echo "HTTP API 5XXError Sum:"
    run_soft metric_sum AWS/ApiGateway 5XXError \
      --dimensions "Name=ApiId,Value=${HTTP_API_ID}" "Name=Stage,Value=${HTTP_STAGE}"
  fi
else
  echo "[info] No HTTP API containing revenue discovered."
fi

section "CloudFront discovery"
CF_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"

if [[ -z "${CF_ID}" ]]; then
  CF_ID="$(aws cloudfront list-distributions --output json 2>/dev/null \
    | jq -r '.DistributionList.Items[]? 
      | select(
          (.Comment // "" | test("revenue"; "i")) 
          or (([.Origins.Items[]?.DomainName] | join(",")) | test("revenue"; "i"))
        ) 
      | .Id' \
    | head -n 1 || true)"
fi

if [[ -n "${CF_ID}" ]]; then
  echo "CloudFront Distribution: ${CF_ID}"
  echo "Note: CloudFront metrics are queried from us-east-1."

  echo "CloudFront Requests Sum:"
  run_soft aws --region us-east-1 cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront \
    --metric-name Requests \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period "${PERIOD}" \
    --statistics Sum \
    --dimensions "Name=DistributionId,Value=${CF_ID}" "Name=Region,Value=Global" \
    --output json \
    | jq -r '[.Datapoints[].Sum] | add // 0'

  echo "CloudFront 5xxErrorRate Average/Maximum:"
  run_soft aws --region us-east-1 cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront \
    --metric-name 5xxErrorRate \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period "${PERIOD}" \
    --statistics Average Maximum \
    --dimensions "Name=DistributionId,Value=${CF_ID}" "Name=Region,Value=Global" \
    --output json \
    | jq -r '{
        avg_max: ([.Datapoints[].Average] | max // 0),
        max: ([.Datapoints[].Maximum] | max // 0)
      }'
else
  echo "[warn] No CloudFront distribution discovered. Set CLOUDFRONT_DISTRIBUTION_ID to check it explicitly."
fi

section "Done"
echo "Metric preflight is read-only. No secret values were printed."
