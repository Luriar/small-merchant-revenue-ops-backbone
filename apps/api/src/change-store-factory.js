const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { AuroraChangeRepository } = require("./aurora-change-repository");
const { InMemoryChangeStore } = require("./change-store");

function createChangeStoreFromEnv({ env = process.env, queryExecutor } = {}) {
  if (env.CHANGE_STORE_BACKEND === "aurora") {
    return new AuroraChangeRepository({
      db: queryExecutor ?? createAuroraQueryExecutorFromEnv({ env }),
    });
  }

  return new InMemoryChangeStore();
}

module.exports = {
  createChangeStoreFromEnv,
};
