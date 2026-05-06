const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Client } = require("pg");

const DEFAULT_TIMEOUT_MS = 5000;

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

function classifyAuroraHealthError(error) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("AURORA_SECRET_ARN")) {
    return "missing_secret_arn";
  }
  if (message.includes("SecretString")) {
    return "secret_read_failed";
  }
  if (message.includes("username") || message.includes("password") || message.includes("host")) {
    return "invalid_secret_shape";
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network/i.test(message)) {
    return "connection_failed";
  }
  return "aurora_health_failed";
}

function parseSecretJson(secretString, fallback = {}) {
  if (!secretString) {
    throw new Error("SecretString is required");
  }

  const secret = JSON.parse(secretString);
  const username = secret.username || secret.user || secret.master_username;
  const password = secret.password || secret.master_password;
  const host = secret.host || secret.endpoint || secret.cluster_endpoint || fallback.host;
  const port = Number(secret.port || fallback.port || 5432);
  const database = secret.dbname || secret.database || secret.database_name || fallback.database || "revenue_ops";

  if (!username || !password || !host || !database) {
    throw new Error("Secret must contain username, password, host, and database/dbname or env fallback");
  }

  return { username, password, host, port, database };
}

async function getSecretStringFromArn({ secretArn, region }) {
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  return result.SecretString;
}

async function queryAurora({ connection, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const client = new Client({
    host: connection.host,
    port: connection.port,
    user: connection.username,
    password: connection.password,
    database: connection.database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  });

  await client.connect();
  try {
    const result = await client.query(
      "SELECT 1 AS ok, current_database() AS database_name, now() AS server_time",
    );
    return result.rows[0] || {};
  } finally {
    await client.end();
  }
}

async function checkAuroraHealth({
  env = process.env,
  getSecretString = getSecretStringFromArn,
  queryDatabase = queryAurora,
} = {}) {
  const secretArn = env.AURORA_SECRET_ARN;
  if (!secretArn) {
    throw new Error("AURORA_SECRET_ARN is required");
  }

  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "ap-northeast-2";
  const secretString = await getSecretString({ secretArn, region });
  const connection = parseSecretJson(secretString, {
    host: env.AURORA_CLUSTER_ENDPOINT,
    port: env.AURORA_PORT,
    database: env.AURORA_DATABASE_NAME,
  });
  const row = await queryDatabase({ connection });

  return {
    ok: true,
    aurora: {
      connected: row.ok === 1 || row.ok === "1",
      database: row.database_name || connection.database,
      server_time_present: Boolean(row.server_time),
    },
  };
}

async function handleGetAuroraHealth({ response, env = process.env } = {}) {
  try {
    const body = await checkAuroraHealth({ env });
    return writeJson(response, 200, body);
  } catch (error) {
    return writeJson(response, 503, {
      ok: false,
      aurora: {
        connected: false,
        error_type: classifyAuroraHealthError(error),
      },
    });
  }
}

module.exports = {
  checkAuroraHealth,
  classifyAuroraHealthError,
  handleGetAuroraHealth,
  parseSecretJson,
};
