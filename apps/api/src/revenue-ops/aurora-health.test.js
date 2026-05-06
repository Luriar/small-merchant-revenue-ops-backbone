const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkAuroraHealth,
  classifyAuroraHealthError,
  parseSecretJson,
} = require("./aurora-health");

test("parseSecretJson accepts Terraform-style Aurora secret shape", () => {
  const parsed = parseSecretJson(JSON.stringify({
    username: "revenue_ops_admin",
    password: "do-not-leak",
    host: "example.cluster.local",
    port: 5432,
    dbname: "revenue_ops",
  }));

  assert.equal(parsed.username, "revenue_ops_admin");
  assert.equal(parsed.password, "do-not-leak");
  assert.equal(parsed.host, "example.cluster.local");
  assert.equal(parsed.port, 5432);
  assert.equal(parsed.database, "revenue_ops");
});

test("checkAuroraHealth reads secret and runs a safe SELECT smoke", async () => {
  const calls = [];

  const result = await checkAuroraHealth({
    env: {
      AURORA_SECRET_ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:test",
      AWS_REGION: "ap-northeast-2",
    },
    async getSecretString({ secretArn, region }) {
      calls.push({ type: "secret", secretArn, region });
      return JSON.stringify({
        username: "revenue_ops_admin",
        password: "do-not-leak",
        host: "example.cluster.local",
        port: 5432,
        dbname: "revenue_ops",
      });
    },
    async queryDatabase({ connection }) {
      calls.push({
        type: "query",
        database: connection.database,
        hasPassword: Boolean(connection.password),
      });
      return {
        ok: 1,
        database_name: connection.database,
        server_time: new Date().toISOString(),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.aurora.connected, true);
  assert.equal(result.aurora.database, "revenue_ops");
  assert.equal(result.aurora.server_time_present, true);
  assert.deepEqual(calls.map((call) => call.type), ["secret", "query"]);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("do-not-leak"), false);
  assert.equal(serialized.includes("example.cluster.local"), false);
  assert.equal(serialized.includes("arn:aws"), false);
});

test("classifyAuroraHealthError returns safe categories", () => {
  assert.equal(classifyAuroraHealthError(new Error("AURORA_SECRET_ARN is required")), "missing_secret_arn");
  assert.equal(classifyAuroraHealthError(new Error("SecretString is required")), "secret_read_failed");
  assert.equal(classifyAuroraHealthError(new Error("connect ETIMEDOUT")), "connection_failed");
});


test("parseSecretJson supports env fallback for host, port, and database", () => {
  const parsed = parseSecretJson(
    JSON.stringify({
      username: "revenue_ops_admin",
      password: "do-not-leak",
      database: "revenue_ops",
    }),
    {
      host: "example.cluster.local",
      port: "5432",
      database: "fallback_db",
    },
  );

  assert.equal(parsed.username, "revenue_ops_admin");
  assert.equal(parsed.password, "do-not-leak");
  assert.equal(parsed.host, "example.cluster.local");
  assert.equal(parsed.port, 5432);
  assert.equal(parsed.database, "revenue_ops");
});
