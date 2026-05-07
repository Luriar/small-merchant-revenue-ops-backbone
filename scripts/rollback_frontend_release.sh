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

aws s3 sync "s3://${bucket}/releases/${release_id}/" "s3://${bucket}/" \
  --delete \
  --exclude "releases/*" \
  --region "${region}"

invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "${distribution_id}" \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text)"

echo "Frontend rollback selected release: ${release_id}"
echo "CloudFront invalidation: ${invalidation_id}"
echo "Verify: https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api"
