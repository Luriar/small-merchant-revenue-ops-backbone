const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REQUIRED_BASELINE_OBJECTS,
  runAuroraConnectionSmoke,
  sanitizeErrorMessage,
} = require("./aurora-connection-smoke");

function createWriter() {
  const chunks = [];
  return {
    chunks,
    writer: {
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
  };
}

function createEnv(overrides = {}) {
  return {
    AURORA_DATABASE_URL: "postgres://api_user:secret@example.test/product_ops",
    CHANGE_STORE_BACKEND: "aurora",
    EVENT_STORE_BACKEND: "aurora",
    ISSUE_STORE_BACKEND: "aurora",
    RUN_STORE_BACKEND: "aurora",
    TRACE_STORE_BACKEND: "aurora",
    ...overrides,
  };
}

test("Aurora connection smoke runs only read-only checks and reports baseline objects", async () => {
  const queries = [];
  const stdout = createWriter();
  const stderr = createWriter();
  const queryExecutor = {
    async query(text, values = []) {
      queries.push({ text, values });
      if (text === "SELECT 1 AS ok") {
        return { rows: [{ ok: 1 }] };
      }

      return { rows: [{ object_name: values[0] }] };
    },
  };

  const result = await runAuroraConnectionSmoke({
    env: createEnv({ AURORA_DB_SSLMODE: "require" }),
    queryExecutor,
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.status, "ok");
  assert.equal(result.body.database_url_present, true);
  assert.equal(result.body.sslmode, "require");
  assert.deepEqual(result.body.aurora_backends, [
    "CHANGE_STORE_BACKEND",
    "EVENT_STORE_BACKEND",
    "ISSUE_STORE_BACKEND",
    "RUN_STORE_BACKEND",
    "TRACE_STORE_BACKEND",
  ]);
  assert.equal(Object.keys(result.body.checks).length, REQUIRED_BASELINE_OBJECTS.length);
  assert.equal(stderr.chunks.length, 0);
  assert.equal(stdout.chunks.join("").includes("secret"), false);
  assert.equal(queries.every((query) => query.text.startsWith("SELECT ")), true);
});

test("Aurora connection smoke fails without an Aurora backend opt-in", async () => {
  const stdout = createWriter();
  const stderr = createWriter();
  let queryCalled = false;

  const result = await runAuroraConnectionSmoke({
    env: createEnv({
      CHANGE_STORE_BACKEND: "memory",
      EVENT_STORE_BACKEND: "memory",
      ISSUE_STORE_BACKEND: "memory",
      RUN_STORE_BACKEND: "memory",
      TRACE_STORE_BACKEND: "memory",
    }),
    queryExecutor: {
      async query() {
        queryCalled = true;
        return { rows: [] };
      },
    },
    stdout: stdout.writer,
    stderr: stderr.writer,
  });

  assert.equal(result.ok, false);
  assert.equal(result.body.status, "failed");
  assert.equal(queryCalled, false);
  assert.equal(stdout.chunks.length, 0);
  assert.match(stderr.chunks.join(""), /aurora_connection_smoke_failed/);
});

test("Aurora connection smoke redacts postgres connection strings from errors", () => {
  const message = sanitizeErrorMessage(
    new Error("connect failed for postgres://api_user:secret@example.test/product_ops"),
  );

  assert.equal(message, "connect failed for postgres://[redacted]");
});
