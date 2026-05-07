#!/usr/bin/env bash
set -euo pipefail

function_name=""
alias_name="live"
artifact_bucket=""
release_id=""
codedeploy_app=""
codedeploy_group=""
region="ap-northeast-2"
package_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --function-name) function_name="$2"; shift 2 ;;
    --alias) alias_name="$2"; shift 2 ;;
    --artifact-bucket) artifact_bucket="$2"; shift 2 ;;
    --release-id) release_id="$2"; shift 2 ;;
    --codedeploy-app) codedeploy_app="$2"; shift 2 ;;
    --codedeploy-group) codedeploy_group="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    --package-path) package_path="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${function_name}" || -z "${alias_name}" || -z "${artifact_bucket}" || -z "${release_id}" || -z "${codedeploy_app}" || -z "${codedeploy_group}" ]]; then
  echo "Usage: $0 --function-name <name> --alias <alias> --artifact-bucket <bucket> --release-id <id> --codedeploy-app <app> --codedeploy-group <group> [--region <region>] [--package-path <zip>]" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${package_path}" ]]; then
  bash "${repo_root}/scripts/package_step2d_revenue_api_lambda.sh"
  package_path="${repo_root}/build/revenue-api-step2d.zip"
fi

s3_key="api-packages/${release_id}/revenue-api-step2d.zip"
aws s3 cp "${package_path}" "s3://${artifact_bucket}/${s3_key}" --region "${region}"

current_version="$(aws lambda get-alias \
  --function-name "${function_name}" \
  --name "${alias_name}" \
  --region "${region}" \
  --query "FunctionVersion" \
  --output text)"

target_version="$(aws lambda update-function-code \
  --function-name "${function_name}" \
  --s3-bucket "${artifact_bucket}" \
  --s3-key "${s3_key}" \
  --publish \
  --region "${region}" \
  --query "Version" \
  --output text)"

appspec_path="$(mktemp)"
revision_path="$(mktemp)"

node -e '
const fs = require("node:fs");
const [appspecPath, revisionPath, fn, aliasName, currentVersion, targetVersion] = process.argv.slice(1);
const appspec = {
  version: 0.0,
  Resources: [{
    revenueApi: {
      Type: "AWS::Lambda::Function",
      Properties: {
        Name: fn,
        Alias: aliasName,
        CurrentVersion: currentVersion,
        TargetVersion: targetVersion
      }
    }
  }]
};
const content = JSON.stringify(appspec);
fs.writeFileSync(appspecPath, `${JSON.stringify(appspec, null, 2)}\n`);
fs.writeFileSync(revisionPath, `${JSON.stringify({ revisionType: "AppSpecContent", appSpecContent: { content } }, null, 2)}\n`);
' "${appspec_path}" "${revision_path}" "${function_name}" "${alias_name}" "${current_version}" "${target_version}"

deployment_id="$(aws deploy create-deployment \
  --application-name "${codedeploy_app}" \
  --deployment-group-name "${codedeploy_group}" \
  --revision "file://${revision_path}" \
  --description "Revenue OS ${release_id} Lambda alias canary" \
  --region "${region}" \
  --query "deploymentId" \
  --output text)"

mkdir -p "${repo_root}/build"

printf "%s\n" "${deployment_id}" > "${repo_root}/build/codedeploy-deployment-id.txt"
printf "%s\n" "${current_version}" > "${repo_root}/build/lambda-current-version.txt"
printf "%s\n" "${target_version}" > "${repo_root}/build/lambda-target-version.txt"

cat > "${repo_root}/build/codedeploy-release-metadata.json" <<EOF_META
{
  "release_id": "${release_id}",
  "function_name": "${function_name}",
  "alias": "${alias_name}",
  "artifact_bucket": "${artifact_bucket}",
  "artifact_key": "${s3_key}",
  "current_version": "${current_version}",
  "target_version": "${target_version}",
  "codedeploy_app": "${codedeploy_app}",
  "codedeploy_group": "${codedeploy_group}",
  "deployment_id": "${deployment_id}",
  "region": "${region}"
}
EOF_META

echo "Lambda package uploaded: s3://${artifact_bucket}/${s3_key}"
echo "Current alias version: ${current_version}"
echo "Target published version: ${target_version}"
echo "CodeDeploy deployment id: ${deployment_id}"
echo "Deployment id file: build/codedeploy-deployment-id.txt"
echo "Release metadata file: build/codedeploy-release-metadata.json"
echo "Inspect: aws deploy get-deployment --deployment-id ${deployment_id} --region ${region}"
