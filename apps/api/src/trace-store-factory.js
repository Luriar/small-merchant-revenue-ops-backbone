const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { AuroraTraceRepository } = require("./aurora-trace-repository");
const { InMemoryTraceStore } = require("./trace-store");

function createTraceStoreFromEnv({ env = process.env, queryExecutor } = {}) {
  if (env.TRACE_STORE_BACKEND === "aurora") {
    return new AuroraTraceRepository({
      db: queryExecutor ?? createAuroraQueryExecutorFromEnv({ env }),
    });
  }

  return new InMemoryTraceStore();
}

module.exports = {
  createTraceStoreFromEnv,
};
