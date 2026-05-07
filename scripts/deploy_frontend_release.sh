#!/usr/bin/env bash
set -euo pipefail

release_id=""
bucket=""
distribution_id=""
region="ap-northeast-2"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id) release_id="$2"; shift 2 ;;
    --bucket) bucket="$2"; shift 2 ;;
    --distribution-id) distribution_id="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${release_id}" || -z "${bucket}" || -z "${distribution_id}" ]]; then
  echo "Usage: $0 --release-id <id> --bucket <bucket> --distribution-id <id> [--region <region>]" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/apps/web/dist"
manifest_path="${repo_root}/build/frontend-release-manifest.json"

if [[ ! -d "${dist_dir}" || ! -f "${dist_dir}/index.html" ]]; then
  npm --prefix "${repo_root}/apps/web" run build
fi

aws s3 sync "${dist_dir}/" "s3://${bucket}/releases/${release_id}/" \
  --delete \
  --region "${region}"

aws s3 sync "${dist_dir}/" "s3://${bucket}/" \
  --delete \
  --exclude "releases/*" \
  --region "${region}"

aws s3api head-object \
  --bucket "${bucket}" \
  --key "index.html" \
  --region "${region}" \
  >/dev/null

invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "${distribution_id}" \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text)"

mkdir -p "${repo_root}/build"
node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({ release_id: process.argv[2], bucket: process.argv[3], distribution_id: process.argv[4], invalidation_id: process.argv[5], deployed_at: new Date().toISOString() }, null, 2) + "\n")' \
  "${manifest_path}" "${release_id}" "${bucket}" "${distribution_id}" "${invalidation_id}"

echo "Frontend release deployed: ${release_id}"
echo "S3 release: s3://${bucket}/releases/${release_id}/"
echo "CloudFront invalidation: ${invalidation_id}"
