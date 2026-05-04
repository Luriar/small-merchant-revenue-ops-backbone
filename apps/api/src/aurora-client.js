function createAuroraQueryExecutorFromEnv({ env = process.env } = {}) {
  const connectionString = env.AURORA_DATABASE_URL ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("AURORA_DATABASE_URL or DATABASE_URL is required for aurora store");
  }

  // `pg` is loaded lazily so the in-memory slices continue to work without a
  // database dependency in local tests.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString,
    ssl: env.AURORA_DB_SSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });

  return {
    async query(text, values) {
      return pool.query(text, values);
    },
    async withTransaction(work) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await work({
          query(text, values) {
            return client.query(text, values);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async end() {
      await pool.end();
    },
  };
}

module.exports = {
  createAuroraQueryExecutorFromEnv,
};
