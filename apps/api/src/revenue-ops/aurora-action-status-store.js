const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require("pg");

const TABLE_NAME = "revenue_action_status_override";

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

function createAuroraActionStatusStore({
  env = process.env,
  getSecretString = getSecretStringFromArn,
  poolFactory = (config) => new Pool(config),
} = {}) {
  const secretArn = env.AURORA_SECRET_ARN;
  const endpoint = env.AURORA_CLUSTER_ENDPOINT;

  if (!secretArn || !endpoint) {
    throw new Error("AURORA_SECRET_ARN and AURORA_CLUSTER_ENDPOINT are required");
  }

  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "ap-northeast-2";
  let poolPromise;
  let schemaReady = false;

  async function getPool() {
    if (!poolPromise) {
      poolPromise = (async () => {
        const secretString = await getSecretString({ secretArn, region });
        const connection = parseSecretJson(secretString, {
          host: endpoint,
          port: env.AURORA_PORT,
          database: env.AURORA_DATABASE_NAME,
        });

        return poolFactory({
          host: connection.host,
          port: connection.port,
          user: connection.username,
          password: connection.password,
          database: connection.database,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 10000,
          max: 2,
        });
      })();
    }

    return poolPromise;
  }

  async function ensureSchema() {
    if (schemaReady) {
      return;
    }

    const pool = await getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        action_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('recommended', 'selected', 'planned', 'done', 'dismissed')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    schemaReady = true;
  }

  return {
    async listActionStatusOverrides() {
      await ensureSchema();
      const pool = await getPool();
      const result = await pool.query(`
        SELECT action_id, status, updated_at
        FROM ${TABLE_NAME}
      `);
      return result.rows.map((row) => ({
        action_id: row.action_id,
        status: row.status,
        updated_at: row.updated_at,
      }));
    },

    async upsertActionStatus(actionId, status) {
      await ensureSchema();
      const pool = await getPool();
      const result = await pool.query(
        `
          INSERT INTO ${TABLE_NAME} (action_id, status, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (action_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = now()
          RETURNING action_id, status, updated_at
        `,
        [actionId, status],
      );

      return result.rows[0];
    },
  };
}

function createOptionalAuroraActionStatusStoreFromEnv({ env = process.env } = {}) {
  if (!env.AURORA_SECRET_ARN || !env.AURORA_CLUSTER_ENDPOINT) {
    return null;
  }

  return createAuroraActionStatusStore({ env });
}

module.exports = {
  createAuroraActionStatusStore,
  createOptionalAuroraActionStatusStoreFromEnv,
  parseSecretJson,
};
