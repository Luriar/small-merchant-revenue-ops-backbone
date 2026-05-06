const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const { createServer } = require("../server");
const { createRevenueOpsStore } = require("./revenue-ops-store");
const { createRevenueOpsSaasStore } = require("./revenue-ops-saas-store");

test("store-scoped API requires auth, resolves app user, and lists a seed store", async () => {
  const server = createTestServer();

  const noAuth = await requestJson({ server, method: "GET", routePath: "/api/v1/stores" });
  assert.equal(noAuth.statusCode, 401);
  assert.equal(noAuth.value.error.code, "unauthorized");

  const me = await requestJson({ server, method: "GET", routePath: "/api/v1/me", authSub: "user-a", authEmail: "user-a@example.com" });
  assert.equal(me.statusCode, 200);
  assert.equal(me.value.app_user.cognito_sub, "user-a");

  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "user-a" });
  assert.equal(stores.statusCode, 200);
  assert.equal(stores.value.stores.length >= 1, true);
  assert.equal(stores.value.stores[0].store_name, "성수 커피음료 매장");
});

test("POST /stores creates tenant, store, and owner membership for current user", async () => {
  const server = createTestServer();

  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "store-owner",
    input: {
      store_name: "합정 샌드위치 매장",
      tenant_name: "Hapjeong Test Tenant",
      business_category: "sandwich",
      region: "Seoul Hapjeong",
      address_text: "서울 마포구 합정동",
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.value.store.store_name, "합정 샌드위치 매장");
  assert.equal(created.value.store.member_role, "owner");

  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "store-owner" });
  assert.equal(stores.value.stores.some((store) => store.store_id === created.value.store.store_id), true);
});

test("store-scoped actions reject non-members and persist status with outcome placeholder", async () => {
  const server = createTestServer();
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "action-owner" });
  const storeId = stores.value.stores[0].store_id;

  const denied = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub: "not-a-member",
  });
  assert.equal(denied.statusCode, 403);

  const actions = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub: "action-owner",
  });
  assert.equal(actions.statusCode, 200);
  assert.equal(actions.value.actions.length > 0, true);
  assert.equal(actions.value.actions[0].store_id, storeId);
  assert.ok(actions.value.actions[0].cause_candidate);
  assert.ok(actions.value.actions[0].evidence_snippets);

  const actionId = actions.value.actions[0].action_id;
  const patched = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions/${encodeURIComponent(actionId)}/status`,
    authSub: "action-owner",
    input: { status: "done" },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.value.action.status, "done");
  assert.ok(patched.value.action.completed_at);
  assert.equal(patched.value.action.outcome_tracking.summary.includes("결과 추적 대기 중"), true);

  const refetched = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub: "action-owner",
  });
  assert.equal(refetched.value.actions.find((action) => action.action_id === actionId).status, "done");
});

test("revenue upload accepts valid rows and records rejected rows safely", async () => {
  const server = createTestServer();
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "upload-owner" });
  const storeId = stores.value.stores[0].store_id;

  const preview = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads/preview`,
    authSub: "upload-owner",
    input: {
      parser_type: "standard_daily_revenue_csv",
      source_type: "generic_pos_csv",
      csv_text: [
        "business_date,channel,gross_sales_amount,net_sales_amount,order_count",
        "2026-05-02,offline_pos,1320000,1260000,91",
        "bad-date,offline_pos,1000,900,1",
      ].join("\n"),
    },
  });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.value.preview.quality_summary.accepted_count, 1);
  assert.equal(preview.value.preview.quality_summary.rejected_count, 1);

  const upload = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "upload-owner",
    input: {
      source_type: "manual_template",
      original_filename: "manual_seed.json",
      daily_rows: [
        {
          business_date: "2026-05-01",
          channel: "offline_pos",
          gross_sales_amount: 1250000,
          net_sales_amount: 1180000,
          order_count: 82,
          cancel_count: 1,
          refund_amount: 12000,
          discount_amount: 58000,
          payment_card_amount: 1080000,
          payment_cash_amount: 100000,
        },
        { business_date: "bad-date", order_count: 1 },
      ],
      item_rows: [
        {
          business_date: "2026-05-01",
          channel: "offline_pos",
          item_name: "아메리카노",
          item_category: "coffee",
          quantity: 41,
          gross_sales_amount: 184500,
          discount_amount: 0,
          net_sales_amount: 184500,
        },
      ],
    },
  });

  assert.equal(upload.statusCode, 201);
  assert.equal(upload.value.upload.accepted_count, 2);
  assert.equal(upload.value.upload.rejected_count, 1);
  assert.equal(upload.value.upload.status, "partially_accepted");

  const uploads = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "upload-owner",
  });
  assert.equal(uploads.statusCode, 200);
  assert.equal(uploads.value.uploads.some((item) => item.upload_id === upload.value.upload.upload_id), true);

  const rejected = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads/${encodeURIComponent(upload.value.upload.upload_id)}/rejected-rows`,
    authSub: "upload-owner",
  });
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.value.rejected_rows.length, 1);
  assert.equal(rejected.value.rejected_rows[0].reason_code, "invalid_business_date");

  const reprocess = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads/${encodeURIComponent(upload.value.upload.upload_id)}/reprocess`,
    authSub: "upload-owner",
  });
  assert.equal(reprocess.statusCode, 202);
  assert.equal(reprocess.value.job_run.status, "skipped");
});

test("context seed collector works without external API keys and updates pipeline meta", async () => {
  const server = createTestServer();
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "context-owner" });
  const storeId = stores.value.stores[0].store_id;

  const collect = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub: "context-owner",
    input: { mode: "seed" },
  });
  assert.equal(collect.statusCode, 202);
  assert.equal(collect.value.collector_run.status, "completed");

  const context = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context`,
    authSub: "context-owner",
  });
  assert.equal(context.statusCode, 200);
  assert.equal(context.value.context.some((item) => Array.isArray(item.context_observations)), true);

  const meta = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/pipeline-meta`,
    authSub: "context-owner",
  });
  assert.equal(meta.statusCode, 200);
  assert.ok(meta.value.pipeline_meta.latest_context_observation);
  assert.equal(meta.value.pipeline_meta.data_reliability_note.includes("인과가 확정된 것"), true);
});

test("store-scoped OPTIONS preflight returns 204", async () => {
  const server = createTestServer();
  const response = await dispatchServerRequest({
    server,
    method: "OPTIONS",
    routePath: "/api/v1/stores/store-1/actions",
    headers: {},
    content: null,
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-methods"].includes("POST"), true);
});

test("production-lite store records outbox, jobs, and idempotent daily mart rows", async () => {
  const store = createRevenueOpsSaasStore();
  const user = store.resolveAppUserFromJwtClaims({ sub: "runtime-owner", email: "runtime@example.com" });
  const stores = store.listStoresForUser(user.app_user_id);
  const storeId = stores[0].store_id;

  const built = store.buildStoreRevenueDailyMart(storeId);
  assert.equal(built.mart_build_run.status, "completed");
  assert.equal(built.rows_written > 0, true);

  const rebuilt = store.buildStoreRevenueDailyMart(storeId);
  const martRows = store.getStoreRevenueDailyMart(storeId);
  assert.equal(rebuilt.rows_written, built.rows_written);
  assert.equal(martRows.length, built.rows_written);

  const outbox = store.createOutboxEvent({
    event_type: "test.event",
    aggregate_type: "store",
    aggregate_id: storeId,
    store_id: storeId,
    idempotency_key: `test.event:${storeId}`,
    payload: { safe: true },
  });
  const duplicate = store.createOutboxEvent({
    event_type: "test.event",
    aggregate_type: "store",
    aggregate_id: storeId,
    store_id: storeId,
    idempotency_key: `test.event:${storeId}`,
    payload: { safe: true },
  });
  assert.equal(duplicate.event_id, outbox.event_id);
  assert.equal(store.markOutboxPublished(outbox.event_id).status, "published");
});

async function requestJson({ server, method, routePath, input, authSub, authEmail }) {
  const headers = {};
  let content = null;
  if (typeof input !== "undefined") {
    headers["content-type"] = "application/json";
    content = JSON.stringify(input);
  }
  if (authSub) {
    headers["x-test-cognito-sub"] = authSub;
  }
  if (authEmail) {
    headers["x-test-email"] = authEmail;
  }

  const response = await dispatchServerRequest({
    server,
    method,
    routePath,
    headers,
    content,
  });

  return {
    statusCode: response.status,
    value: response.text ? JSON.parse(response.text) : null,
  };
}

function createTestServer() {
  return createServer({
    changeStore: {},
    eventStore: {},
    issueStore: {},
    runStore: {},
    traceStore: {},
    revenueOpsStore: createRevenueOpsStore(),
    revenueOpsSaasStore: createRevenueOpsSaasStore(),
    logger: createSilentLogger(),
  });
}

function dispatchServerRequest({ server, method, routePath, headers, content }) {
  const request = Readable.from(content === null ? [] : [Buffer.from(content)]);
  request.method = method;
  request.url = routePath;
  request.headers = headers;

  const response = new FakeResponse();
  server.emit("request", request, response);
  return response.done;
}

function createSilentLogger() {
  return { info() {} };
}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.writableFinished = false;
    this.chunks = [];
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  }

  end(value = "") {
    if (value) {
      this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    }
    this.writableFinished = true;
    const text = Buffer.concat(this.chunks).toString("utf8");
    this.emit("finish");
    this.emit("close");
    this.resolveDone({ status: this.statusCode, text, headers: this.headers });
  }
}
