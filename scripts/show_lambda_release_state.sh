#!/usr/bin/env bash
set -euo pipefail

function_name=""
codedeploy_app=""
codedeploy_group=""
region="ap-northeast-2"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --function-name) function_name="$2"; shift 2 ;;
    --codedeploy-app) codedeploy_app="$2"; shift 2 ;;
    --codedeploy-group) codedeploy_group="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${function_name}" ]]; then
  echo "Usage: $0 --function-name <name> [--codedeploy-app <app> --codedeploy-group <group>] [--region <region>]" >&2
  exit 2
fi

echo "Lambda versions:"
aws lambda list-versions-by-function \
  --function-name "${function_name}" \
  --region "${region}" \
  --query "Versions[].{Version:Version,LastModified:LastModified,CodeSha256:CodeSha256}" \
  --output table

echo "Lambda aliases:"
aws lambda list-aliases \
  --function-name "${function_name}" \
  --region "${region}" \
  --query "Aliases[].{Name:Name,FunctionVersion:FunctionVersion,RoutingConfig:RoutingConfig}" \
  --output table

if [[ -n "${codedeploy_app}" && -n "${codedeploy_group}" ]]; then
  echo "Recent CodeDeploy deployments:"
  aws deploy list-deployments \
    --application-name "${codedeploy_app}" \
    --deployment-group-name "${codedeploy_group}" \
    --include-only-statuses Created Queued InProgress Succeeded Failed Stopped \
    --region "${region}" \
    --query "deployments[0:10]" \
    --output table
fi
