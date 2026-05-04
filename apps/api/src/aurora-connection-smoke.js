const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { validateStartupConfig } = require("./startup-config");

const REQUIRED_BASELINE_OBJECTS = Object.freeze([
  { key: "prod_change_table", name: "public.prod_change" },
  { key: "event_intake_table", name: "public.event_intake" },
  { key: "issue_table", name: "public.issue" },
  { key: "run_table", name: "public.run" },
  { key: "trace_table", name: "public.trace" },
  { key: "evidence_table", name: "public.evidence" },
  { key: "run_state_log_table", name: "public.run_state_log" },
  { key: "change_intake_idempotency_table", name: "public.change_intake_idempotency" },
  { key: "issue_intake_idempotency_table", name: "public.issue_intake_idempotency" },
]);

function sanitizeErrorMessage(error) {
  const message = error instanceof Error ? error.message : "unknown error";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]");
}

async function checkRequiredObject(queryExecutor, object) {
  const result = await queryExecutor.query("SELECT to_regclass($1) AS object_name", [object.name]);
  return {
    key: object.key,
    present: typeof result.rows?.[0]?.object_name === "string",
  };
}

async function runAuroraConnectionSmoke({
  env = process.env,
  queryExecutor,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let db = queryExecutor;
  let shouldClose = false;

  try {
    const config = validateStartupConfig({ env });
    if (config.auroraBackends.length === 0) {
      throw new Error("at least one *_STORE_BACKEND=aurora setting is required for Aurora smoke");
    }

    if (!db) {
      db = createAuroraQueryExecutorFromEnv({ env });
      shouldClose = true;
    }

    await db.query("SELECT 1 AS ok", []);
    const objectChecks = await Promise.all(
      REQUIRED_BASELINE_OBJECTS.map((object) => checkRequiredObject(db, object)),
    );
    const missingObjects = objectChecks.filter((check) => !check.present);
    const body = {
      status: missingObjects.length === 0 ? "ok" : "failed",
      aurora_backends: config.auroraBackends,
      database_url_present: config.hasDatabaseUrl,
      sslmode: env.AURORA_DB_SSLMODE === "require" ? "require" : "default",
      checks: Object.fromEntries(
        objectChecks.map((check) => [check.key, check.present ? "ok" : "missing"]),
      ),
    };

    stdout.write(`${JSON.stringify(body)}\n`);
    return { ok: missingObjects.length === 0, body };
  } catch (error) {
    const body = {
      status: "failed",
      error: {
        code: "aurora_connection_smoke_failed",
        message: sanitizeErrorMessage(error),
      },
    };

    stderr.write(`${JSON.stringify(body)}\n`);
    return { ok: false, body };
  } finally {
    if (shouldClose && db && typeof db.end === "function") {
      await db.end();
    }
  }
}

if (require.main === module) {
  runAuroraConnectionSmoke().then(({ ok }) => {
    process.exitCode = ok ? 0 : 1;
  });
}

module.exports = {
  REQUIRED_BASELINE_OBJECTS,
  runAuroraConnectionSmoke,
  sanitizeErrorMessage,
};
