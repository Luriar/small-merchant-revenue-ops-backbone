const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PERMISSIONS_SQL = path.join(ROOT, "infra", "sql", "aurora", "permissions", "001_roles_and_grants.sql");
const PERMISSIONS_README = path.join(ROOT, "infra", "sql", "aurora", "permissions", "README.md");

function readPermissionsSql() {
  return fs.readFileSync(PERMISSIONS_SQL, "utf8");
}

function grantBlock(sql, privilege, role) {
  const pattern = new RegExp(`GRANT\\s+${privilege}\\s+ON\\s+TABLE([\\s\\S]*?)TO\\s+${role}\\s*;`, "i");
  const match = sql.match(pattern);

  assert.ok(match, `expected ${privilege} table grant for ${role}`);
  return match[1];
}

function grantStatementsForRole(sql, role) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => /^GRANT\b/i.test(statement))
    .filter((statement) => new RegExp(`\\bTO\\s+${role}\\b`, "i").test(statement));
}

function assertNoWriteGrants(sql, role) {
  const writeGrant = grantStatementsForRole(sql, role).find((statement) =>
    /^GRANT\s+(?:INSERT|UPDATE|DELETE)\b/i.test(statement),
  );

  assert.equal(writeGrant, undefined);
}

test("Aurora permissions grant app_role usage on run_state_log sequence", () => {
  const sql = readPermissionsSql();

  assert.match(sql, /GRANT\s+USAGE\s+ON\s+SEQUENCE\s+run_state_log_log_id_seq\s+TO\s+app_role\s*;/i);
});

test("Aurora permissions keep evidence and run_state_log append-only for app_role", () => {
  const sql = readPermissionsSql();
  const appUpdateBlock = grantBlock(sql, "UPDATE", "app_role");

  assert.doesNotMatch(appUpdateBlock, /\bevidence\b/i);
  assert.doesNotMatch(appUpdateBlock, /\brun_state_log\b/i);
  assert.match(sql, /REVOKE\s+UPDATE,\s*DELETE\s+ON\s+TABLE\s+evidence\s+FROM\s+app_role\s*;/i);
  assert.match(sql, /REVOKE\s+UPDATE,\s*DELETE\s+ON\s+TABLE\s+run_state_log\s+FROM\s+app_role\s*;/i);
});

test("Aurora permissions keep readonly_role read-only", () => {
  const sql = readPermissionsSql();

  assert.match(sql, /GRANT\s+SELECT\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+readonly_role\s*;/i);
  assertNoWriteGrants(sql, "readonly_role");
  assert.match(sql, /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+run_state_log\s+FROM\s+readonly_role\s*;/i);
  assert.match(sql, /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+evidence\s+FROM\s+readonly_role\s*;/i);
});

test("Aurora permissions keep debezium_cdc non-mutating", () => {
  const sql = readPermissionsSql();

  assert.match(sql, /CREATE\s+ROLE\s+debezium_cdc\s+NOLOGIN\s*;/i);
  assert.match(sql, /GRANT\s+SELECT\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+debezium_cdc\s*;/i);
  assertNoWriteGrants(sql, "debezium_cdc");
  assert.match(sql, /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+run_state_log\s+FROM\s+debezium_cdc\s*;/i);
  assert.match(sql, /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+evidence\s+FROM\s+debezium_cdc\s*;/i);
});

test("Aurora permissions cover intake tables without mutating grants", () => {
  const sql = readPermissionsSql();
  const appSelectBlock = grantBlock(sql, "SELECT", "app_role");
  const appInsertBlock = grantBlock(sql, "INSERT", "app_role");

  for (const table of ["change_intake_idempotency", "event_intake", "issue_intake_idempotency"]) {
    assert.match(appSelectBlock, new RegExp(`\\b${table}\\b`, "i"));
    assert.match(appInsertBlock, new RegExp(`\\b${table}\\b`, "i"));
    assert.match(sql, new RegExp(`REVOKE\\s+UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+${table}\\s+FROM\\s+app_role\\s*;`, "i"));
    assert.match(sql, new RegExp(`REVOKE\\s+INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+${table}\\s+FROM\\s+readonly_role\\s*;`, "i"));
    assert.match(sql, new RegExp(`REVOKE\\s+INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+TABLE\\s+${table}\\s+FROM\\s+debezium_cdc\\s*;`, "i"));
  }
});

test("Aurora permissions docs no longer describe intake tables as post-baseline local ledgers", () => {
  const sql = readPermissionsSql();
  const readme = fs.readFileSync(PERMISSIONS_README, "utf8");

  assert.doesNotMatch(sql, /post-baseline local ledger/i);
  assert.doesNotMatch(readme, /next task should add/i);
  assert.match(sql, /Older-baseline compatibility\/backfill migrations/i);
  assert.match(readme, /run_state_log_log_id_seq/);
});
