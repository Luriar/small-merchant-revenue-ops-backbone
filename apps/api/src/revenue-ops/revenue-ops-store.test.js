const test = require("node:test");
const assert = require("node:assert/strict");

const exportData = require("./data/revenue_ops_export.json");
const { createRevenueOpsStore } = require("./revenue-ops-store");

const KNOWN_ACTION_ID = exportData.actions[0].action_id;

test("Revenue Ops store overlays Aurora action status overrides on GET actions", async () => {
  const store = createRevenueOpsStore({
    actionStatusPersistence: {
      async listActionStatusOverrides() {
        return [{ action_id: KNOWN_ACTION_ID, status: "planned" }];
      },
    },
  });

  const actions = await store.getActions();
  const action = actions.find((item) => item.action_id === KNOWN_ACTION_ID);

  assert.equal(action.status, "planned");
});

test("Revenue Ops store persists action status to Aurora when persistence is available", async () => {
  const writes = [];
  const store = createRevenueOpsStore({
    actionStatusPersistence: {
      async listActionStatusOverrides() {
        return [];
      },
      async upsertActionStatus(actionId, status) {
        writes.push({ actionId, status });
        return { action_id: actionId, status };
      },
    },
  });

  const result = await store.updateActionStatus(KNOWN_ACTION_ID, "done");

  assert.equal(result.action.action_id, KNOWN_ACTION_ID);
  assert.equal(result.action.status, "done");
  assert.equal(result.status_persistence, "aurora");
  assert.deepEqual(writes, [{ actionId: KNOWN_ACTION_ID, status: "done" }]);
});

test("Revenue Ops store falls back to memory if Aurora persistence fails", async () => {
  const store = createRevenueOpsStore({
    actionStatusPersistence: {
      async listActionStatusOverrides() {
        throw new Error("db unavailable");
      },
      async upsertActionStatus() {
        throw new Error("db unavailable");
      },
    },
  });

  const result = await store.updateActionStatus(KNOWN_ACTION_ID, "selected");
  const actions = await store.getActions();
  const action = actions.find((item) => item.action_id === KNOWN_ACTION_ID);

  assert.equal(result.status_persistence, "memory_fallback");
  assert.equal(action.status, "selected");
});
