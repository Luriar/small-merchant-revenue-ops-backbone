const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const BASELINE_DDL = path.join(ROOT, "sources", "aurora_ddl_v2.sql");
const POST_BASELINE_RUN_LOG_SQL = path.join(ROOT, "infra", "sql", "aurora", "005_run_state_log_insert_bootstrap.sql");
const AURORA_SQL_README = path.join(ROOT, "infra", "sql", "aurora", "README.md");

test("Aurora post-baseline SQL bootstraps run_state_log on run insert", () => {
  const baseline = fs.readFileSync(BASELINE_DDL, "utf8");
  const hardening = fs.readFileSync(POST_BASELINE_RUN_LOG_SQL, "utf8");

  assert.match(baseline, /CREATE TRIGGER trg_run_status_change_log\s+AFTER UPDATE OF status ON run/s);
  assert.doesNotMatch(baseline, /AFTER INSERT ON run[\s\S]*run_state_log/);

  assert.match(hardening, /CREATE OR REPLACE FUNCTION trg_log_run_state_insert\(\)/);
  assert.match(hardening, /INSERT INTO run_state_log \(run_id, from_status, to_status, attempt, reason, metadata\)/);
  assert.match(hardening, /CREATE TRIGGER trg_run_state_insert_log\s+AFTER INSERT ON run/s);
});

test("Aurora baseline DDL already auto-maintains trace evidence_count", () => {
  const baseline = fs.readFileSync(BASELINE_DDL, "utf8");

  assert.match(baseline, /CREATE OR REPLACE FUNCTION trg_update_trace_evidence_count\(\)/);
  assert.match(baseline, /CREATE TRIGGER trg_evidence_count_insert\s+AFTER INSERT ON evidence/s);
  assert.match(baseline, /CREATE TRIGGER trg_evidence_count_delete\s+AFTER DELETE ON evidence/s);
});

test("Aurora SQL README includes run_state_log bootstrap apply order", () => {
  const readme = fs.readFileSync(AURORA_SQL_README, "utf8");

  assert.match(readme, /005_run_state_log_insert_bootstrap\.sql/);
});
