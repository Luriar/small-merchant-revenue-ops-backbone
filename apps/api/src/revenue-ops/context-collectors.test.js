const test = require("node:test");
const assert = require("node:assert/strict");

const { planStorePublicContextCollection } = require("./context-collectors");

test("context collector plan falls back to seed without live API keys", () => {
  const plan = planStorePublicContextCollection({ mode: "auto", env: {} });
  assert.equal(plan.resolved_mode, "seed");
  assert.equal(plan.safe_to_run_without_keys, true);
  assert.equal(plan.collectors.every((collector) => collector.status === "seed_ready"), true);
});

test("context collector plan marks missing live keys as skipped", () => {
  const plan = planStorePublicContextCollection({ mode: "live", env: { KMA_SERVICE_KEY: "present" } });
  assert.equal(plan.resolved_mode, "live");
  assert.equal(plan.collectors.find((collector) => collector.collector_name === "weather").status, "live_ready");
  assert.equal(plan.collectors.find((collector) => collector.collector_name === "geocoding").status, "skipped_missing_key");
});
