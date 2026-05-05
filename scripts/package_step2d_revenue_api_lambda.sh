#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_root="${repo_root}/build/api-lambda"
zip_path="${repo_root}/build/revenue-api-step2d.zip"

mkdir -p "${repo_root}/build"
rm -rf "${package_root}" "${zip_path}"
mkdir -p "${package_root}"

cp "${repo_root}/apps/api/lambda-index.js" "${package_root}/index.js"
mkdir -p "${package_root}/src/revenue-ops"
cp "${repo_root}/apps/api/src/lambda-handler.js" "${package_root}/src/lambda-handler.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-handler.js" "${package_root}/src/revenue-ops/revenue-ops-handler.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-store.js" "${package_root}/src/revenue-ops/revenue-ops-store.js"
cp -R "${repo_root}/apps/api/src/revenue-ops/data" "${package_root}/src/revenue-ops/data"

find "${package_root}" \
  \( -name "*.tfvars" -o -name "*.tfstate" -o -name "tfplan*" -o -name ".env" -o -name ".env.*" \) \
  -print -quit | grep -q . && {
    echo "Refusing to package Terraform state/plan/tfvars or env files." >&2
    exit 1
  }

(
  cd "${package_root}"
  zip -qr "${zip_path}" index.js src
)

unzip -l "${zip_path}" | sed -n '1,80p'
