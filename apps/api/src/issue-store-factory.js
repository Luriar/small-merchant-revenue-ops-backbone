const { createAuroraQueryExecutorFromEnv } = require("./aurora-client");
const { AuroraIssueRepository } = require("./aurora-issue-repository");
const { InMemoryIssueStore } = require("./issue-store");

function createIssueStoreFromEnv({ env = process.env, queryExecutor } = {}) {
  if (env.ISSUE_STORE_BACKEND === "aurora") {
    return new AuroraIssueRepository({
      db: queryExecutor ?? createAuroraQueryExecutorFromEnv({ env }),
    });
  }

  return new InMemoryIssueStore();
}

module.exports = {
  createIssueStoreFromEnv,
};
