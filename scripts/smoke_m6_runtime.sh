#!/usr/bin/env bash
set -euo pipefail

api_base=""
id_token=""
store_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base) api_base="$2"; shift 2 ;;
    --id-token) id_token="$2"; shift 2 ;;
    --store-id) store_id="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${api_base}" || -z "${id_token}" ]]; then
  echo "Usage: $0 --api-base <url> --id-token <token> [--store-id <id>]" >&2
  exit 2
fi

api_base="${api_base%/}"
auth_header="Authorization: Bearer ${id_token}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

curl_json() {
  local method="$1"
  local path="$2"
  local body_path="${3:-}"
  if [[ -n "${body_path}" ]]; then
    curl -fsS -X "${method}" \
      -H "${auth_header}" \
      -H "Content-Type: application/json" \
      --data-binary "@${body_path}" \
      "${api_base}${path}"
  else
    curl -fsS -X "${method}" \
      -H "${auth_header}" \
      "${api_base}${path}"
  fi
}

stores_path="${tmp_dir}/stores.json"
curl_json GET "/api/v1/stores" > "${stores_path}"

if [[ -z "${store_id}" ]]; then
  store_id="$(node -e 'const fs=require("node:fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(body.stores?.[0]?.store_id ?? "")' "${stores_path}")"
fi

if [[ -z "${store_id}" ]]; then
  create_body="${tmp_dir}/create-store.json"
  node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({ store_name:"M6 smoke store", tenant_name:"M6 Smoke Tenant", business_category:"cafe", region:"서울 성동구", address_text:"서울 성동구 성수이로 87" }))' "${create_body}"
  created_path="${tmp_dir}/created.json"
  curl_json POST "/api/v1/stores" "${create_body}" > "${created_path}"
  store_id="$(node -e 'const fs=require("node:fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(body.store?.store_id ?? "")' "${created_path}")"
fi

collect_body="${tmp_dir}/collect.json"
node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({ mode:"live", reason:"store_onboarding_bootstrap" }))' "${collect_body}"
collect_path="${tmp_dir}/collect-result.json"
curl_json POST "/api/v1/stores/${store_id}/context/collect" "${collect_body}" > "${collect_path}"

meta_path="${tmp_dir}/pipeline-meta.json"
curl_json GET "/api/v1/stores/${store_id}/pipeline-meta" > "${meta_path}"

node -e '
const fs = require("node:fs");
const collect = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const meta = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).pipeline_meta ?? {};
const summary = collect.summary ?? {};
const latestRun = meta.latest_collector_run ?? {};
const latestMeta = latestRun.metadata ?? {};
console.log(JSON.stringify({
  store_id: process.argv[3],
  collector_run_status: collect.collector_run?.status,
  completed_collector_count: summary.completed_collector_count ?? meta.completed_collector_count ?? latestMeta.completed_collector_count,
  skipped_collector_count: summary.skipped_collector_count ?? meta.skipped_collector_count ?? latestMeta.skipped_collector_count,
  failed_collector_count: summary.failed_collector_count ?? meta.failed_collector_count ?? latestMeta.failed_collector_count,
  timed_out_collector_count: summary.timed_out_collector_count ?? meta.timed_out_collector_count ?? latestMeta.timed_out_collector_count,
  latest_context_collection_reason: meta.latest_context_collection_reason,
  latest_revenue_upload_present: Boolean(meta.latest_revenue_upload)
}, null, 2));
' "${collect_path}" "${meta_path}" "${store_id}"
