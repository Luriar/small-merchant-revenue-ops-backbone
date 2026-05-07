#!/usr/bin/env bash
set -euo pipefail

deployment_id=""
deployment_id_file=""
function_name=""
alias_name="live"
region="ap-northeast-2"
api_base=""
id_token=""
poll_interval_seconds="${POLL_INTERVAL_SECONDS:-30}"
max_polls="${MAX_POLLS:-20}"
out_dir="${OUT_DIR:-build/codedeploy-verify}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deployment-id) deployment_id="$2"; shift 2 ;;
    --deployment-id-file) deployment_id_file="$2"; shift 2 ;;
    --function-name) function_name="$2"; shift 2 ;;
    --alias) alias_name="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    --api-base) api_base="$2"; shift 2 ;;
    --id-token) id_token="$2"; shift 2 ;;
    --poll-interval-seconds) poll_interval_seconds="$2"; shift 2 ;;
    --max-polls) max_polls="$2"; shift 2 ;;
    --out-dir) out_dir="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${deployment_id}" && -n "${deployment_id_file}" && -f "${deployment_id_file}" ]]; then
  deployment_id="$(tr -d '[:space:]' < "${deployment_id_file}")"
fi

if [[ -z "${deployment_id}" || -z "${function_name}" ]]; then
  echo "Usage: $0 --deployment-id <id>|--deployment-id-file <path> --function-name <name> [--alias <alias>] [--region <region>] [--api-base <url>] [--id-token <jwt>]" >&2
  exit 2
fi

mkdir -p "${out_dir}"

echo "== Verify CodeDeploy deployment =="
echo "DEPLOYMENT_ID=${deployment_id}"
echo "FUNCTION_NAME=${function_name}"
echo "ALIAS=${alias_name}"
echo "REGION=${region}"

final_status=""
for i in $(seq 1 "${max_polls}"); do
  echo "===== deployment poll ${i}/${max_polls} ====="

  final_status="$(aws deploy get-deployment \
    --region "${region}" \
    --deployment-id "${deployment_id}" \
    | tee "${out_dir}/deployment-${i}.json" \
    | jq -r '.deploymentInfo.status')"

  aws deploy get-deployment \
    --region "${region}" \
    --deployment-id "${deployment_id}" \
    | jq '{
        deploymentId: .deploymentInfo.deploymentId,
        status: .deploymentInfo.status,
        deploymentOverview: .deploymentInfo.deploymentOverview,
        errorInformation: .deploymentInfo.errorInformation
      }'

  aws lambda get-alias \
    --region "${region}" \
    --function-name "${function_name}" \
    --name "${alias_name}" \
    | tee "${out_dir}/live-alias-${i}.json" \
    | jq '{Name, FunctionVersion, RoutingConfig}'

  if [[ "${final_status}" == "Succeeded" ]]; then
    break
  fi

  if [[ "${final_status}" == "Failed" || "${final_status}" == "Stopped" ]]; then
    echo "Deployment ended with status: ${final_status}" >&2
    exit 3
  fi

  sleep "${poll_interval_seconds}"
done

if [[ "${final_status}" != "Succeeded" ]]; then
  echo "Deployment did not finish within polling window. Last status: ${final_status}" >&2
  exit 4
fi

echo "== final deployment =="
aws deploy get-deployment \
  --region "${region}" \
  --deployment-id "${deployment_id}" \
  | tee "${out_dir}/final-deployment.json" \
  | jq '{
      deploymentId: .deploymentInfo.deploymentId,
      status: .deploymentInfo.status,
      deploymentOverview: .deploymentInfo.deploymentOverview,
      errorInformation: .deploymentInfo.errorInformation
    }'

echo "== final alias =="
aws lambda get-alias \
  --region "${region}" \
  --function-name "${function_name}" \
  --name "${alias_name}" \
  | tee "${out_dir}/final-live-alias.json" \
  | jq '{Name, FunctionVersion, RoutingConfig}'

if [[ -n "${api_base}" && -n "${id_token}" ]]; then
  echo "== runtime API smoke =="
  bash "$(dirname "${BASH_SOURCE[0]}")/smoke_m6_runtime.sh" \
    --api-base "${api_base}" \
    --id-token "${id_token}"
else
  echo "Skipping runtime API smoke because api_base or id_token is empty."
fi

echo "CodeDeploy verification succeeded."
