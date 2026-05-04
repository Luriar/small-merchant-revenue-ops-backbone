const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { AuroraEventRepository } = require("./aurora-event-repository");
const { InMemoryEventStore } = require("./event-store");

function createEventStoreFromEnv({ env = process.env, queryExecutor } = {}) {
  if (env.EVENT_STORE_BACKEND === "aurora") {
    return new AuroraEventRepository({
      db: queryExecutor ?? createAuroraQueryExecutorFromEnv({ env }),
    });
  }

  return new InMemoryEventStore();
}

module.exports = {
  createEventStoreFromEnv,
};
