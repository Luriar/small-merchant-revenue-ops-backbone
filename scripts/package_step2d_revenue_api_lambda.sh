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
mkdir -p "${package_root}/src/revenue-ops/connectors"
cp "${repo_root}/apps/api/src/lambda-handler.js" "${package_root}/src/lambda-handler.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-handler.js" "${package_root}/src/revenue-ops/revenue-ops-handler.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-auth.js" "${package_root}/src/revenue-ops/revenue-ops-auth.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-store.js" "${package_root}/src/revenue-ops/revenue-ops-store.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-saas-store.js" "${package_root}/src/revenue-ops/revenue-ops-saas-store.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-saas-aurora-store.js" "${package_root}/src/revenue-ops/revenue-ops-saas-aurora-store.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-ops-saas-store-factory.js" "${package_root}/src/revenue-ops/revenue-ops-saas-store-factory.js"
cp "${repo_root}/apps/api/src/revenue-ops/revenue-upload-parsers.js" "${package_root}/src/revenue-ops/revenue-upload-parsers.js"
cp "${repo_root}/apps/api/src/revenue-ops/runtime-boundaries.js" "${package_root}/src/revenue-ops/runtime-boundaries.js"
cp "${repo_root}/apps/api/src/revenue-ops/context-collectors.js" "${package_root}/src/revenue-ops/context-collectors.js"
cp "${repo_root}/apps/api/src/revenue-ops/connectors/toss-place-client.js" "${package_root}/src/revenue-ops/connectors/toss-place-client.js"
cp "${repo_root}/apps/api/src/revenue-ops/aurora-health.js" "${package_root}/src/revenue-ops/aurora-health.js"
cp "${repo_root}/apps/api/src/revenue-ops/aurora-action-status-store.js" "${package_root}/src/revenue-ops/aurora-action-status-store.js"
cp "${repo_root}/infra/db/revenue_ops_step3_4_lite.sql" "${package_root}/src/revenue-ops/revenue_ops_step3_4_lite.sql"
cp -R "${repo_root}/apps/api/src/revenue-ops/data" "${package_root}/src/revenue-ops/data"

node - "${repo_root}/package.json" "${package_root}/package.json" <<'NODE'
const fs = require("node:fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
const rootPackage = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const dependencies = rootPackage.dependencies || {};
const required = ["@aws-sdk/client-secrets-manager", "pg"];
const selected = {};
for (const name of required) {
  if (!dependencies[name]) {
    throw new Error(`Missing required Lambda dependency in root package.json: ${name}`);
  }
  selected[name] = dependencies[name];
}
fs.writeFileSync(targetPath, `${JSON.stringify({ private: true, dependencies: selected }, null, 2)}\n`);
NODE

(
  cd "${package_root}"
  npm install --omit=dev --no-audit --no-fund --package-lock=false
)

find "${package_root}" \
  \( -name "*.tfvars" -o -name "*.tfstate" -o -name "tfplan*" -o -name ".env" -o -name ".env.*" \) \
  -print -quit | grep -q . && {
    echo "Refusing to package Terraform state/plan/tfvars or env files." >&2
    exit 1
  }

(
  cd "${package_root}"
  zip -qr "${zip_path}" index.js src node_modules package.json
)

unzip -l "${zip_path}" | sed -n '1,80p'
