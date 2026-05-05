#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="${ROOT_DIR}/infra/terraform/envs/revenue-dev"
DEFAULT_TFVARS="${ENV_DIR}/terraform.step1c.first-subset.tfvars"
TFVARS_FILE="${TFVARS_FILE:-${DEFAULT_TFVARS}}"

RUN_PLAN=false
for arg in "$@"; do
  case "${arg}" in
    --plan)
      RUN_PLAN=true
      ;;
    -h|--help)
      cat <<'USAGE'
Usage:
  scripts/step2_frontend_first_plan_precheck.sh [--plan]

Default mode is non-mutating precheck only.

Optional --plan mode runs terraform init/validate/plan only after these
environment variables and the local tfvars file are present:
  TF_BACKEND_BUCKET
  TF_BACKEND_KEY
  TF_BACKEND_REGION
  TF_BACKEND_DYNAMODB_TABLE
  TFVARS_FILE (optional; defaults to infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars)

This script never runs terraform apply, deploys frontend assets, enables
schedules, runs collectors, or applies Aurora migrations.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

echo "== STEP 2 frontend-first activation precheck =="
echo "repo: ${ROOT_DIR}"
echo "env:  ${ENV_DIR}"

echo
echo "== Git status =="
git -C "${ROOT_DIR}" status --short

echo
echo "== Tool versions =="
terraform version
if command -v aws >/dev/null 2>&1; then
  aws --version
else
  echo "aws CLI not found"
fi

echo
echo "== Required files =="
test -f "${ENV_DIR}/backend.tf"
test -f "${ENV_DIR}/terraform.step1c.first-subset.tfvars.example"
if [[ -f "${TFVARS_FILE}" ]]; then
  echo "local tfvars found: ${TFVARS_FILE}"
else
  echo "local tfvars missing: ${TFVARS_FILE}"
  echo "copy the example and replace placeholders before plan"
fi

echo
echo "== Terraform format =="
terraform fmt -recursive -check "${ROOT_DIR}/infra/terraform"

echo
echo "== AWS identity =="
if command -v aws >/dev/null 2>&1; then
  if [[ -n "${AWS_PROFILE:-}" ]]; then
    echo "AWS_PROFILE=${AWS_PROFILE}"
  else
    echo "AWS_PROFILE is not set; using default credential chain"
  fi
  if aws sts get-caller-identity --output text; then
    echo "AWS caller identity check passed"
  else
    echo "AWS caller identity check failed"
    if [[ "${RUN_PLAN}" == true ]]; then
      echo "--plan requires a valid AWS caller identity" >&2
      exit 3
    fi
  fi
else
  echo "skipped: aws CLI not installed"
fi

if [[ "${RUN_PLAN}" != true ]]; then
  echo
  echo "Precheck complete. Terraform plan was not run."
  echo "Run with --plan only after backend values, AWS profile/account, and local tfvars are confirmed."
  exit 0
fi

echo
echo "== Explicit plan gate =="
required_env=(
  TF_BACKEND_BUCKET
  TF_BACKEND_KEY
  TF_BACKEND_REGION
  TF_BACKEND_DYNAMODB_TABLE
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing required environment variable for --plan: ${name}" >&2
    exit 3
  fi
done

if [[ ! -f "${TFVARS_FILE}" ]]; then
  echo "missing local tfvars for --plan: ${TFVARS_FILE}" >&2
  exit 3
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "missing required command for placeholder check: rg" >&2
  exit 3
fi

if rg -n "YOURACCOUNTID|your@email.com" "${TFVARS_FILE}" >/dev/null; then
  echo "local tfvars still contains placeholders; refusing to plan" >&2
  exit 3
fi

cd "${ENV_DIR}"

terraform init \
  -backend-config="bucket=${TF_BACKEND_BUCKET}" \
  -backend-config="key=${TF_BACKEND_KEY}" \
  -backend-config="region=${TF_BACKEND_REGION}" \
  -backend-config="dynamodb_table=${TF_BACKEND_DYNAMODB_TABLE}" \
  -backend-config="encrypt=true"

terraform validate

terraform plan \
  -var-file="${TFVARS_FILE}" \
  -out="tfplan.step2.frontend-first"

echo
echo "Plan complete: ${ENV_DIR}/tfplan.step2.frontend-first"
echo "Hard stop: review the plan. Do not run terraform apply without explicit approval."
