const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// These tests assert that the Aurora baseline DDL provisions the intake tables
// the existing intake repositories assume. They check column presence, the
// primary-key constraint names that conflict-recovery branches match against,
// and the FK targets back to baseline tables.

const ROOT = path.resolve(__dirname, "..", "..", "..");
const BASELINE_DDL_PATH = path.join(ROOT, "sources", "aurora_ddl_v2.sql");
const BASELINE_DDL = fs.readFileSync(BASELINE_DDL_PATH, "utf8");

test("Aurora baseline DDL defines event_intake with required columns and indexes", () => {
  assert.match(BASELINE_DDL, /CREATE TABLE IF NOT EXISTS event_intake\b/);

  const block = extractCreateTableBlock(BASELINE_DDL, "event_intake");
  assert.ok(block, "event_intake CREATE TABLE block should be present");

  // event_id is the authoritative dedupe key.
  assert.match(block, /event_id\s+TEXT\s+PRIMARY KEY/);

  // Columns referenced by AuroraEventRepository.insertEventIntake.
  for (const column of [
    "occurred_at",
    "target_service",
    "event_type",
    "event_subtype",
    "variation",
    "cohort",
    "duration_ms",
    "retry_count",
    "is_error",
    "user_id",
    "session_id",
    "request_id",
    "payload",
    "source",
    "ingestion_batch_id",
  ]) {
    assert.match(
      block,
      new RegExp(`\\b${column}\\b`),
      `event_intake should declare ${column}`,
    );
  }

  // received_at is intentionally absent in the current repository contract;
  // created_at covers the server-side received timestamp.
  assert.match(block, /created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+NOW\(\)/);

  // Indexes used for replay/lookup paths.
  assert.match(
    BASELINE_DDL,
    /CREATE INDEX IF NOT EXISTS idx_event_intake_service_time\s+ON event_intake \(target_service, occurred_at DESC\)/,
  );
  assert.match(
    BASELINE_DDL,
    /CREATE INDEX IF NOT EXISTS idx_event_intake_type_subtype_time\s+ON event_intake \(event_type, event_subtype, occurred_at DESC\)/,
  );
});

test("Aurora baseline DDL defines change_intake_idempotency with PK and FK to prod_change", () => {
  assert.match(BASELINE_DDL, /CREATE TABLE IF NOT EXISTS change_intake_idempotency\b/);

  const block = extractCreateTableBlock(BASELINE_DDL, "change_intake_idempotency");
  assert.ok(block, "change_intake_idempotency CREATE TABLE block should be present");

  for (const column of ["request_type", "idempotency_key", "change_id", "created_at"]) {
    assert.match(
      block,
      new RegExp(`\\b${column}\\b`),
      `change_intake_idempotency should declare ${column}`,
    );
  }

  // The PK constraint name matches the conflict-recovery branch in
  // AuroraChangeRepository (isChangeIdempotencyConflict checks
  // pk_change_intake_idempotency).
  assert.match(
    block,
    /CONSTRAINT pk_change_intake_idempotency\s+PRIMARY KEY \(request_type, idempotency_key\)/,
  );

  // FK back to prod_change keeps the ledger consistent with cascade deletes.
  assert.match(
    block,
    /change_id\s+TEXT\s+NOT NULL\s+REFERENCES prod_change\(change_id\)\s+ON DELETE CASCADE/,
  );

  // Reverse-lookup index from change_id.
  assert.match(
    BASELINE_DDL,
    /CREATE INDEX IF NOT EXISTS idx_change_intake_idempotency_change_id\s+ON change_intake_idempotency \(change_id\)/,
  );
});

test("Aurora baseline DDL defines issue_intake_idempotency with PK and FK to issue", () => {
  assert.match(BASELINE_DDL, /CREATE TABLE IF NOT EXISTS issue_intake_idempotency\b/);

  const block = extractCreateTableBlock(BASELINE_DDL, "issue_intake_idempotency");
  assert.ok(block, "issue_intake_idempotency CREATE TABLE block should be present");

  for (const column of ["request_type", "idempotency_key", "issue_id", "created_at"]) {
    assert.match(
      block,
      new RegExp(`\\b${column}\\b`),
      `issue_intake_idempotency should declare ${column}`,
    );
  }

  // PK constraint name matches AuroraIssueRepository.isIssueIdempotencyConflict.
  assert.match(
    block,
    /CONSTRAINT pk_issue_intake_idempotency\s+PRIMARY KEY \(request_type, idempotency_key\)/,
  );

  assert.match(
    block,
    /issue_id\s+TEXT\s+NOT NULL\s+REFERENCES issue\(issue_id\)\s+ON DELETE CASCADE/,
  );

  assert.match(
    BASELINE_DDL,
    /CREATE INDEX IF NOT EXISTS idx_issue_intake_idempotency_issue_id\s+ON issue_intake_idempotency \(issue_id\)/,
  );
});

test("Aurora baseline DDL header inventory and teardown comment list intake tables", () => {
  // Header table inventory should account for the three intake tables added to baseline.
  assert.match(BASELINE_DDL, /테이블 \(12개\)/);
  assert.match(BASELINE_DDL, /event_intake/);
  assert.match(BASELINE_DDL, /change_intake_idempotency/);
  assert.match(BASELINE_DDL, /issue_intake_idempotency/);

  // Teardown comment should drop intake tables before their FK targets.
  assert.match(
    BASELINE_DDL,
    /DROP TABLE IF EXISTS issue_intake_idempotency, change_intake_idempotency, event_intake,/,
  );
});

function extractCreateTableBlock(ddl, tableName) {
  const startRe = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`);
  const startMatch = startRe.exec(ddl);
  if (!startMatch) {
    return null;
  }

  // The CREATE TABLE always closes with a line that is just ");" (whitespace
  // optional). CHECK constraints have nested parens but they never appear on
  // a line by themselves as ");".
  const tail = ddl.slice(startMatch.index);
  const endRe = /^\);\s*$/m;
  const endMatch = endRe.exec(tail);
  if (!endMatch) {
    return null;
  }

  return tail.slice(0, endMatch.index + endMatch[0].length);
}
