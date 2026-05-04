# M1 MVP Demo Seed

This directory contains M1-only demo seed tooling for the Aurora-backed MVP frontend.

It is not an M2 seed path:

- No ClickHouse data is created.
- No CDC, MSK, EKS, Airflow, Argo, Karpenter, Terraform, fake analytics, fake metric series, or fake anomaly markers are started or touched.
- Aurora remains the operational source of truth.

## Script

```bash
bash scripts/demo/m1_mvp_seed.sh
```

The script creates one coherent synthetic demo story:

- checkout release change
- checkout payment-failure event intake row
- safe issue intake row with synthetic raw issue fields stored only behind safe read projections
- suspected trace with evidence linking the change and primary issue
- failed normalization run inserted by seed-only Aurora DML
- retry run through `POST /api/v1/runs/{run_id}/retry`
- reprocess run through `POST /api/v1/reprocess`

## Prerequisites

- API server is already running with Aurora-backed stores.
- SSM port forwarding to Aurora is already active when needed.
- Local shell can connect to Aurora with `AURORA_DATABASE_URL` or `DATABASE_URL`.
- `curl`, `jq`, `psql`, `grep`, `date`, and Bash are installed.

Required environment:

```bash
export AURORA_DATABASE_URL='<set outside this file>'
# or:
export DATABASE_URL='<set outside this file>'
```

Optional environment:

```bash
export API_BASE_URL='http://127.0.0.1:3000'
export WEB_BASE_URL='http://127.0.0.1:5173'
export DEMO_SUFFIX='m1-demo-local-001'
```

If API auth is enabled, provide caller tokens through environment variables. The script reads these values but never prints them:

```bash
export DEMO_OPERATOR_BEARER_TOKEN='<operator-token>'
export DEMO_VIEWER_BEARER_TOKEN='<viewer-token>'
```

Fallback token variable names are also supported for parity with smoke scripts:

```bash
export SMOKE_OPERATOR_BEARER_TOKEN='<operator-token>'
export SMOKE_VIEWER_BEARER_TOKEN='<viewer-token>'
```

## Seed Methods

| Data | Method | Notes |
|---|---|---|
| change | `POST /api/v1/changes` | Public M1 API |
| event | `POST /api/v1/events/intake` | Public M1 API |
| issue | `POST /api/v1/issues/intake` | Public M1 API; read APIs expose safe projection only |
| trace/evidence | `POST /api/v1/traces` | Existing internal worker path |
| failed source run | Aurora DML | Seed-only gap because no public run-create API exists |
| retry | `POST /api/v1/runs/{run_id}/retry` | Public M1 API |
| reprocess | `POST /api/v1/reprocess` | Public M1 API |

## Frontend URLs

The current web app reads `data=api` from the query string and the active screen from the hash. Use this URL shape:

```text
http://127.0.0.1:5173/?data=api&demo=m1#changes
http://127.0.0.1:5173/?data=api&demo=m1#issues
http://127.0.0.1:5173/?data=api&demo=m1#runs
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

`demo=m1` keeps the Aurora-backed view focused on rows created by this seed path. General API mode remains available without the demo filter:

```text
http://127.0.0.1:5173/?data=api#changes
http://127.0.0.1:5173/?data=api#issues
http://127.0.0.1:5173/?data=api#runs
http://127.0.0.1:5173/?data=api#traceability
```

Planning notes sometimes abbreviate these as `#changes?data=api`, `#issues?data=api`, `#runs?data=api`, and `#traceability?data=api`; with the current router, keep query parameters before the hash.

## Safety Notes

- Do not print, paste, or commit real database URLs, passwords, `SecretString`, bearer tokens, secret ARNs, or DB endpoints.
- The script does not fetch secrets.
- The script does not echo the full database URL.
- Rows are synthetic and intentionally not cleaned up.
- Use the default generated `DEMO_SUFFIX` for normal runs.
- Reusing a previous `DEMO_SUFFIX` can produce idempotent API replays or active reprocess conflicts; only reuse a suffix intentionally.
- The failed seed run is inserted by direct Aurora DML only because M1 has no public run-create API.
