const test = require("node:test");
const assert = require("node:assert/strict");

const { createRevenueOpsSaasStore } = require("./revenue-ops-saas-store");
const { createRuntimeBoundaries } = require("./runtime-boundaries");

test("runtime boundaries default to outbox, Aurora mart, and inline orchestration", async () => {
  const store = createRevenueOpsSaasStore();
  const user = store.resolveAppUserFromJwtClaims({ sub: "boundary-owner" });
  const [seedStore] = store.listStoresForUser(user.app_user_id);
  const boundaries = createRuntimeBoundaries({ env: {}, store });

  const event = await boundaries.eventPublisher.publish({
    event_type: "boundary.test",
    aggregate_type: "store",
    aggregate_id: seedStore.store_id,
    store_id: seedStore.store_id,
    idempotency_key: `boundary.test:${seedStore.store_id}`,
    payload: { safe: true },
  });
  assert.equal(event.status, "pending");

  const mart = await boundaries.analyticsWriter.writeDailyMart({ storeId: seedStore.store_id });
  assert.equal(mart.mart_build_run.status, "completed");

  const workflow = await boundaries.orchestrator.startWorkflow("daily_revenue_mart_build", { store_id: seedStore.store_id });
  assert.equal(workflow.status, "completed_inline");
});

test("runtime boundaries expose disabled skeletons for scale backends", async () => {
  const store = createRevenueOpsSaasStore();
  const boundaries = createRuntimeBoundaries({
    env: {
      EVENT_BACKEND: "sqs",
      ANALYTICS_BACKEND: "clickhouse",
      ORCHESTRATION_BACKEND: "stepfunctions",
    },
    store,
  });

  const event = await boundaries.eventPublisher.publish({
    event_type: "boundary.sqs.test",
    aggregate_type: "store",
    aggregate_id: "store-test",
    idempotency_key: "boundary.sqs.test",
  });
  assert.equal(event.publish_backend, "outbox_only");

  const mart = await boundaries.analyticsWriter.writeDailyMart();
  assert.equal(mart.status, "skipped");

  const workflow = await boundaries.orchestrator.startWorkflow("mart_build", {});
  assert.equal(workflow.status, "skipped");
});
