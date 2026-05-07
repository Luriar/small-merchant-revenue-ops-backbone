#!/usr/bin/env bash
set -euo pipefail

function_name=""
alias_name="live"
target_version=""
region="ap-northeast-2"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --function-name) function_name="$2"; shift 2 ;;
    --alias) alias_name="$2"; shift 2 ;;
    --target-version) target_version="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${function_name}" || -z "${alias_name}" || -z "${target_version}" ]]; then
  echo "Usage: $0 --function-name <name> --alias <alias> --target-version <version> [--region <region>]" >&2
  exit 2
fi

aws lambda update-alias \
  --function-name "${function_name}" \
  --name "${alias_name}" \
  --function-version "${target_version}" \
  --routing-config AdditionalVersionWeights={} \
  --region "${region}" \
  --output json

echo "Alias rollback complete."
echo "Smoke:"
echo "  bash scripts/smoke_m6_runtime.sh --api-base <api-base> --id-token <token>"
