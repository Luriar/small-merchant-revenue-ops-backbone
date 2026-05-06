const { createRevenueOpsSaasStore } = require("./revenue-ops-saas-store");
const { createOptionalAuroraRevenueOpsSaasStoreFromEnv } = require("./revenue-ops-saas-aurora-store");

function createRevenueOpsSaasStoreFromEnv({ env = process.env, logger = null } = {}) {
  const auroraStore = createOptionalAuroraRevenueOpsSaasStoreFromEnv({ env });
  if (auroraStore) {
    return auroraStore;
  }

  if (logger?.info) {
    logger.info("revenue_ops_saas_memory_runtime", {
      reason: "aurora_config_absent_or_memory_forced",
    });
  }
  return createRevenueOpsSaasStore();
}

module.exports = {
  createRevenueOpsSaasStoreFromEnv,
};
