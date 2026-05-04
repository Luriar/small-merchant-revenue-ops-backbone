const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { AuroraRunRepository } = require("./aurora-run-repository");
const { InMemoryRunStore } = require("./run-store");

function createRunStoreFromEnv({ env = process.env, queryExecutor } = {}) {
  if (env.RUN_STORE_BACKEND === "aurora") {
    return new AuroraRunRepository({
      db: queryExecutor ?? createAuroraQueryExecutorFromEnv({ env }),
    });
  }

  return new InMemoryRunStore();
}

module.exports = {
  createRunStoreFromEnv,
};
