const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const README = path.join(ROOT, "infra", "sql", "aurora", "README.md");
const APPLY_SCRIPT = path.join(ROOT, "infra", "sql", "aurora", "apply-post-baseline.sh");
const SMOKE_README = path.join(ROOT, "infra", "sql", "aurora", "smoke", "README.md");
const SMOKE_SQL = path.join(ROOT, "infra", "sql", "aurora", "smoke", "001_runtime_consistency_checks.sql");

test("Aurora apply helper includes the post-baseline SQL assets in order", () => {
  const script = fs.readFileSync(APPLY_SCRIPT, "utf8");

  assert.match(script, /001_change_intake_idempotency\.sql/);
  assert.match(script, /002_event_intake\.sql/);
  assert.match(script, /003_issue_intake_idempotency\.sql/);
  assert.match(script, /004_repository_query_indexes\.sql/);
  assert.match(script, /005_run_state_log_insert_bootstrap\.sql/);
  assert.match(script, /permissions\/001_roles_and_grants\.sql/);
});

test("Aurora smoke SQL checks run_state_log bootstrap and evidence_count consistency", () => {
  const sql = fs.readFileSync(SMOKE_SQL, "utf8");

  assert.match(sql, /to_regprocedure\('trg_log_run_state_insert\(\)'\)/);
  assert.match(sql, /FROM run_state_log/);
  assert.match(sql, /BOOL_OR\(from_status IS NULL AND to_status = 'pending'\)/);
  assert.match(sql, /FROM trace/);
  assert.match(sql, /LEFT JOIN evidence/);
  assert.match(sql, /evidence_count_check/);
});

test("Aurora SQL docs reference the smoke helpers", () => {
  const readme = fs.readFileSync(README, "utf8");
  const smokeReadme = fs.readFileSync(SMOKE_README, "utf8");

  assert.match(readme, /apply-post-baseline\.sh/);
  assert.match(readme, /smoke\/001_runtime_consistency_checks\.sql/);
  assert.match(smokeReadme, /GET \/api\/v1\/runs\/<new_run_id>\/state-log/);
  assert.match(smokeReadme, /GET \/api\/v1\/traces\/<trace_id>/);
  assert.match(smokeReadme, /## Before Apply/);
  assert.match(smokeReadme, /## Failure And Recovery Boundary/);
  assert.match(smokeReadme, /## Result Record Template/);
  assert.match(smokeReadme, /Baseline included: yes \| no/);
});
