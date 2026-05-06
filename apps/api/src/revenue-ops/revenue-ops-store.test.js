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
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((write) => write.actionId).sort(),
    [
      "35e6bb16-2893-44cf-87ab-6894f411d7cf",
      "de69259a-5fd2-4062-be74-efbf9d08994c",
    ].sort(),
  );
  assert.deepEqual([...new Set(writes.map((write) => write.status))], ["done"]);
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

test("Revenue Ops store deduplicates semantically duplicated action candidates", async () => {
  const store = createRevenueOpsStore();
  const actions = await store.getActions();
  const titles = actions.map((action) => action.title);

  assert.equal(titles.filter((title) => title === "대표 메뉴 재포지셔닝").length, 1);
  assert.equal(titles.filter((title) => title === "리뷰 응답 우선 관리").length, 1);
  assert.equal(titles.filter((title) => title === "매장 앞 메뉴판/홍보 문구 업데이트").length, 1);

  const menuBoard = actions.find((action) => action.title === "매장 앞 메뉴판/홍보 문구 업데이트");
  assert.equal(menuBoard.duplicate_count, 2);
  assert.equal(Array.isArray(menuBoard.action_family_ids), true);
});
