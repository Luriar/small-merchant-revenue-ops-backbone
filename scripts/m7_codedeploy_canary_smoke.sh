#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-ap-northeast-2}"
FUNCTION_NAME="${FUNCTION_NAME:-revenue-ops-revenue-dev-revenue-api}"
APP_NAME="${APP_NAME:-revenue-ops-revenue-dev-revenue-api}"
DG_NAME="${DG_NAME:-revenue-ops-revenue-dev-revenue-api-live}"
API_BASE="${API_BASE:-https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com}"
STORE_ID="${STORE_ID:-37b37b6f-210e-448c-ab18-71f623332396}"
OUT_DIR="${OUT_DIR:-build/canary-deploy-test}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-30}"
MAX_POLLS="${MAX_POLLS:-20}"

mkdir -p "$OUT_DIR"

echo "== M7 CodeDeploy canary smoke =="
echo "REGION=$REGION"
echo "FUNCTION_NAME=$FUNCTION_NAME"
echo "APP_NAME=$APP_NAME"
echo "DG_NAME=$DG_NAME"
echo "API_BASE=$API_BASE"
echo "STORE_ID=$STORE_ID"

if [ -z "${ID_TOKEN:-}" ]; then
  echo "ID_TOKEN is required for final API smoke test." >&2
  exit 2
fi

CURRENT_VERSION="$(aws lambda get-alias \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --name live \
  | tee "$OUT_DIR/before-live-alias.json" \
  | jq -r '.FunctionVersion')"

echo "CURRENT_VERSION=$CURRENT_VERSION"

CANARY_MARKER="m7-canary-smoke-$(date -u +%Y%m%d-%H%M%S)"
echo "CANARY_MARKER=$CANARY_MARKER"

aws lambda update-function-configuration \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --description "Small-merchant Revenue Ops API. Canary smoke marker: ${CANARY_MARKER}" \
  | tee "$OUT_DIR/update-function-description.json" \
  | jq '{FunctionName, LastModified, Description}'

aws lambda wait function-updated \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME"

NEW_VERSION="$(aws lambda publish-version \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --description "M7 CodeDeploy canary smoke ${CANARY_MARKER}" \
  | tee "$OUT_DIR/published-version.json" \
  | jq -r '.Version')"

echo "NEW_VERSION=$NEW_VERSION"

export FUNCTION_NAME CURRENT_VERSION NEW_VERSION APP_NAME DG_NAME CANARY_MARKER

python3 - <<'PY'
import json
import hashlib
import os
from pathlib import Path

function_name = os.environ["FUNCTION_NAME"]
current_version = os.environ["CURRENT_VERSION"]
target_version = os.environ["NEW_VERSION"]
app_name = os.environ["APP_NAME"]
dg_name = os.environ["DG_NAME"]
marker = os.environ["CANARY_MARKER"]

appspec = {
    "version": 0.0,
    "Resources": [
        {
            "RevenueOpsApiLambda": {
                "Type": "AWS::Lambda::Function",
                "Properties": {
                    "Name": function_name,
                    "Alias": "live",
                    "CurrentVersion": current_version,
                    "TargetVersion": target_version
                }
            }
        }
    ]
}

content = json.dumps(appspec, separators=(",", ":"), ensure_ascii=False)
sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()

create_input = {
    "applicationName": app_name,
    "deploymentGroupName": dg_name,
    "description": f"M7 canary smoke deployment {marker}",
    "revision": {
        "revisionType": "AppSpecContent",
        "appSpecContent": {
            "content": content,
            "sha256": sha256
        }
    }
}

Path("/tmp/m7-codedeploy-appspec-content.json").write_text(content + "\n")
Path("/tmp/m7-codedeploy-create-deployment.json").write_text(
    json.dumps(create_input, indent=2, ensure_ascii=False) + "\n"
)

print("sha256 =", sha256)
print(json.dumps(appspec, indent=2, ensure_ascii=False))
PY

DEPLOYMENT_ID="$(aws deploy create-deployment \
  --region "$REGION" \
  --cli-input-json file:///tmp/m7-codedeploy-create-deployment.json \
  | tee "$OUT_DIR/create-deployment.json" \
  | jq -r '.deploymentId')"

echo "DEPLOYMENT_ID=$DEPLOYMENT_ID"

FINAL_STATUS=""
for i in $(seq 1 "$MAX_POLLS"); do
  echo "===== poll $i ====="

  FINAL_STATUS="$(aws deploy get-deployment \
    --region "$REGION" \
    --deployment-id "$DEPLOYMENT_ID" \
    | tee "$OUT_DIR/deployment-${i}.json" \
    | jq -r '.deploymentInfo.status')"

  aws deploy get-deployment \
    --region "$REGION" \
    --deployment-id "$DEPLOYMENT_ID" \
    | jq '{
        deploymentId: .deploymentInfo.deploymentId,
        status: .deploymentInfo.status,
        deploymentOverview: .deploymentInfo.deploymentOverview,
        errorInformation: .deploymentInfo.errorInformation
      }'

  aws lambda get-alias \
    --region "$REGION" \
    --function-name "$FUNCTION_NAME" \
    --name live \
    | tee "$OUT_DIR/live-alias-${i}.json" \
    | jq '{Name, FunctionVersion, RoutingConfig}'

  if [ "$FINAL_STATUS" = "Succeeded" ]; then
    break
  fi

  if [ "$FINAL_STATUS" = "Failed" ] || [ "$FINAL_STATUS" = "Stopped" ]; then
    echo "Deployment ended with status: $FINAL_STATUS" >&2
    exit 3
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done

if [ "$FINAL_STATUS" != "Succeeded" ]; then
  echo "Deployment did not finish within polling window. Last status: $FINAL_STATUS" >&2
  exit 4
fi

echo "== final deployment =="
aws deploy get-deployment \
  --region "$REGION" \
  --deployment-id "$DEPLOYMENT_ID" \
  | tee "$OUT_DIR/final-deployment.json" \
  | jq '{
      deploymentId: .deploymentInfo.deploymentId,
      status: .deploymentInfo.status,
      deploymentOverview: .deploymentInfo.deploymentOverview,
      errorInformation: .deploymentInfo.errorInformation
    }'

echo "== final alias =="
aws lambda get-alias \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --name live \
  | tee "$OUT_DIR/final-live-alias.json" \
  | jq '{Name, FunctionVersion, RoutingConfig}'

echo "== API smoke: stores =="
curl -sS "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $ID_TOKEN" \
  | tee "$OUT_DIR/smoke-stores.json" \
  | jq '{store_count: (.stores | length)}'

echo "== API smoke: context collect =="
curl -sS -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "live", "reason": "manual_refresh" }' \
  | tee "$OUT_DIR/smoke-context-collect.json" \
  | jq '{
      collector_run_status: .collector_run.status,
      completed_collector_count: .summary.completed_collector_count,
      skipped_collector_count: .summary.skipped_collector_count,
      failed_collector_count: .summary.failed_collector_count,
      timed_out_collector_count: .summary.timed_out_collector_count,
      error: .error
    }'

echo "== restore latest description =="
aws lambda update-function-configuration \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --description "Small-merchant Revenue Ops API." \
  | jq '{FunctionName, LastModified, Description}'

aws lambda wait function-updated \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME"

echo "== done =="
echo "Deployment succeeded: $DEPLOYMENT_ID"
echo "Target version: $NEW_VERSION"
