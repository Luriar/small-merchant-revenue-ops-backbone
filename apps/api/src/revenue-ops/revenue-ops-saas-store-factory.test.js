const test = require("node:test");
const assert = require("node:assert/strict");

const { createRevenueOpsSaasStoreFromEnv } = require("./revenue-ops-saas-store-factory");

test("SaaS store factory uses memory fixture when Aurora config is absent or explicitly disabled", () => {
  const memory = createRevenueOpsSaasStoreFromEnv({
    env: { REVENUE_OPS_SAAS_STORE_BACKEND: "memory" },
    logger: { info() {} },
  });
  assert.ok(memory._state);

  const noConfig = createRevenueOpsSaasStoreFromEnv({
    env: {},
    logger: { info() {} },
  });
  assert.ok(noConfig._state);
});

test("SaaS store factory selects Aurora repository when database configuration exists", () => {
  const store = createRevenueOpsSaasStoreFromEnv({
    env: { DATABASE_URL: "postgres://example:example@localhost:5432/example" },
    logger: { info() {} },
  });
  assert.equal(store._backend, "aurora");
});
