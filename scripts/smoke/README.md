# M1 Aurora Smoke Scripts

These scripts turn the already-passed M1.1 and M1.2 manual Aurora smoke procedures into reproducible local checks.

They are still M1-only:

- Aurora is the operational source of truth.
- The API server must already be running.
- SSM port forwarding to Aurora must already be active when needed.
- No ClickHouse, CDC, MSK, EKS, Airflow, Argo, Terraform apply, or analytics path is started or validated.

## Prerequisites

- `curl`
- `jq`
- `psql`
- `grep`
- Bash
- A running API server configured with Aurora-backed stores.
- Active Aurora connectivity from the local shell, usually through an already-started SSM port forward.

## Required Environment

At minimum:

```bash
export AURORA_DATABASE_URL='<set outside this file>'
# or:
export DATABASE_URL='<set outside this file>'
```

Recommended API runtime parity:

```bash
export AURORA_DB_SSLMODE=require
export RUN_STORE_BACKEND=aurora
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
```

The scripts default to the local API server:

```bash
export API_BASE_URL='http://127.0.0.1:3000'
```

If API auth is enabled, provide smoke caller tokens through environment variables. The scripts read these values but never print them:

```bash
export SMOKE_OPERATOR_BEARER_TOKEN='<operator-token>'
export SMOKE_VIEWER_BEARER_TOKEN='<viewer-token>'
```

If `SMOKE_*` token variables are not set, the scripts fall back to `OPERATOR_BEARER_TOKEN` and `VIEWER_BEARER_TOKEN` when present.

## Execution Order

Run from the repository root:

```bash
bash scripts/smoke/m1_1_aurora_api_smoke.sh
bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

Optional:

```bash
SMOKE_SUFFIX='m1-3-local-001' bash scripts/smoke/m1_1_aurora_api_smoke.sh
SMOKE_SUFFIX='m1-3-local-002' bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

Each script exits non-zero on failure.

## Safety Notes

- Do not print, paste, or commit real `AURORA_DATABASE_URL`, passwords, `SecretString`, bearer tokens, or DB endpoints.
- The scripts do not fetch secrets.
- The scripts do not echo the full database URL.
- Smoke rows are synthetic and intentionally not cleaned up.
- The scripts use unique synthetic suffixes by default.
- Do not reuse the same `SMOKE_SUFFIX` across smoke runs unless intentionally testing idempotent replay. Reusing a previous suffix can make create steps return replay HTTP `200` instead of create HTTP `202`.
- M1.1 issue intake does not send `affected_service`.
- M1.1 event DB verification checks `event_intake.created_at`, not `accepted_at`.
- Raw sentinel leak checks search for raw values only; safe presence flag field names are not treated as leaks.
