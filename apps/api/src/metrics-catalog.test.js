const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const README = path.join(__dirname, "..", "README.md");

test("apps/api metrics catalog documents the core operational events", () => {
  const readme = fs.readFileSync(README, "utf8");

  assert.match(readme, /request_started/);
  assert.match(readme, /request_finished/);
  assert.match(readme, /request_aborted/);
  assert.match(readme, /request_closed/);
  assert.match(readme, /request_failed/);
  assert.match(readme, /server_shutdown_started/);
  assert.match(readme, /server_shutdown_timeout/);
  assert.match(readme, /server_shutdown_completed/);
  assert.match(readme, /server_shutdown_failed/);
  assert.match(readme, /change_intake_processed/);
  assert.match(readme, /issue_status_update_processed/);
  assert.match(readme, /issue_status_update_total/);
  assert.match(readme, /retry_run_processed/);
  assert.match(readme, /trace_create_processed/);
});

test("apps/api metrics catalog documents metric types and tag guidance", () => {
  const readme = fs.readFileSync(README, "utf8");

  assert.match(readme, /counter/);
  assert.match(readme, /gauge/);
  assert.match(readme, /histogram/);
  assert.match(readme, /PII \/ raw data rule/);
  assert.match(readme, /Avoid as metric tags/);
  assert.match(readme, /request_id/);
  assert.match(readme, /raw DB messages/);
});
