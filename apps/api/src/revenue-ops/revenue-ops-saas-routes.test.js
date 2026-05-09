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
  assert.equal(stores.value.stores[0].store_name, "성수 카페 / 디저트");
  assert.equal(stores.value.stores.some((store) => store.store_type === "demo" && store.metadata?.is_demo === true), true);
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
      business_category: "CS100006",
      region: "Seoul Hapjeong",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.value.store.store_name, "합정 샌드위치 매장");
  assert.equal(created.value.store.member_role, "owner");
  assert.equal(created.value.store.metadata.address_selected, true);
  assert.equal(created.value.context_bootstrap_hint.recommended, true);
  assert.equal(created.value.context_bootstrap_hint.mode, "live");
  assert.equal(created.value.context_bootstrap_hint.reason, "store_onboarding_bootstrap");
  assert.equal(created.value.context_bootstrap_hint.prerequisites.has_address_text, true);
  assert.equal(created.value.context_bootstrap_hint.prerequisites.has_business_category, true);

  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "store-owner" });
  assert.equal(stores.value.stores.some((store) => store.store_id === created.value.store.store_id), true);
});

test("POST /stores rejects payload missing required fields with INVALID_STORE_INPUT", async () => {
  const server = createTestServer();

  const missingAll = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "store-owner-missing-context",
    input: {
      store_name: "주소 없는 매장",
    },
  });
  assert.equal(missingAll.statusCode, 400);
  assert.equal(missingAll.value.error.code, "INVALID_STORE_INPUT");
  assert.match(missingAll.value.error.message, /가게 이름, 업종, 주소는 필수/);

  const missingCategory = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "store-owner-missing-category",
    input: {
      store_name: "업종 없는 매장",
      address_text: "서울 마포구 합정동",
      address_source: "search",
    },
  });
  assert.equal(missingCategory.statusCode, 400);

  const typedAddressNotSelected = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "store-owner-typed-address",
    input: {
      store_name: "수동 주소 매장",
      business_category: "CS100010",
      address_text: "임의로 입력한 주소",
    },
  });
  assert.equal(typedAddressNotSelected.statusCode, 400);
});

test("new real stores do not receive demo revenue or action analysis before explicit upload", async () => {
  const server = createTestServer();
  const authSub = "empty-real-store-owner";
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub,
    input: {
      store_name: "매출 없는 실제 매장",
      business_category: "CS100010",
      region: "서울 마포구",
      address_text: "서울 마포구 월드컵북로 1",
      address_source: "search",
      address_selected: true,
    },
  });
  assert.equal(created.statusCode, 201);
  const storeId = created.value.store.store_id;

  const briefs = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub,
  });
  assert.equal(briefs.statusCode, 200);
  assert.deepEqual(briefs.value.briefs, []);

  const actions = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub,
  });
  assert.equal(actions.statusCode, 200);
  assert.deepEqual(actions.value.actions, []);

  const meta = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/pipeline-meta`,
    authSub,
  });
  assert.equal(meta.statusCode, 200);
  assert.equal(meta.value.pipeline_meta.latest_revenue_upload, null);
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

test("revenue upload with overwrite_mode=by_date_channel supersedes prior daily facts for same (date, channel)", async () => {
  const server = createTestServer();
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "overwrite-owner",
    input: {
      store_name: "덮어쓰기 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  assert.equal(created.statusCode, 201);
  const storeId = created.value.store.store_id;

  const first = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "overwrite-owner",
    input: {
      source_type: "manual_template",
      original_filename: "first.json",
      daily_rows: [
        {
          business_date: "2026-05-08",
          channel: "offline_pos",
          gross_sales_amount: 1250000,
          net_sales_amount: 1180000,
          order_count: 82,
        },
      ],
    },
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.value.upload.accepted_count, 1);

  const second = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "overwrite-owner",
    input: {
      source_type: "manual_template",
      original_filename: "second.json",
      daily_rows: [
        {
          business_date: "2026-05-08",
          channel: "offline_pos",
          gross_sales_amount: 2500000,
          net_sales_amount: 2360000,
          order_count: 164,
        },
      ],
      metadata: { overwrite_mode: "by_date_channel" },
    },
  });
  assert.equal(second.statusCode, 201);
  assert.equal(second.value.upload.accepted_count, 1);

  const briefs = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub: "overwrite-owner",
  });
  assert.equal(briefs.statusCode, 200);
  const dailySeries = briefs.value.briefs[0].daily_series;
  // Exactly one row for 2026-05-08 — the prior fact was superseded.
  const may8 = dailySeries.filter((row) => row.date === "2026-05-08");
  assert.equal(may8.length, 1);
  assert.equal(may8[0].net_sales, 2360000);
  assert.equal(may8[0].order_count, 164);
});

test("revenue upload without overwrite_mode keeps prior daily facts (default append, backwards compatible)", async () => {
  const server = createTestServer();
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "append-owner",
    input: {
      store_name: "추가 적재 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  const storeId = created.value.store.store_id;

  await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "append-owner",
    input: {
      source_type: "manual_template",
      original_filename: "first.json",
      daily_rows: [
        { business_date: "2026-05-08", channel: "offline_pos", gross_sales_amount: 1000000, net_sales_amount: 950000, order_count: 70 },
      ],
    },
  });
  await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "append-owner",
    input: {
      source_type: "manual_template",
      original_filename: "second.json",
      daily_rows: [
        { business_date: "2026-05-08", channel: "offline_pos", gross_sales_amount: 2000000, net_sales_amount: 1900000, order_count: 140 },
      ],
    },
  });

  const briefs = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub: "append-owner",
  });
  assert.equal(briefs.statusCode, 200);
  const may8 = briefs.value.briefs[0].daily_series.filter((row) => row.date === "2026-05-08");
  // Two facts present — the original append-and-create-duplicates behavior is unchanged.
  assert.equal(may8.length, 2);
});

test("delivery CSV upload parser creates normalized delivery daily rows without raw login automation", async () => {
  const server = createTestServer();
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "delivery-upload-owner" });
  const storeId = stores.value.stores[0].store_id;

  const upload = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub: "delivery-upload-owner",
    input: {
      source_type: "baemin_orders_csv",
      original_filename: "baemin_orders.csv",
      file_type: "csv",
      csv_text: [
        "주문일,총 결제금액,정산금액,주문수,취소건수,배달비,중개수수료",
        "2026.05.01,\"128,000\",\"104,000\",12,1,\"18,000\",\"6,000\"",
      ].join("\n"),
    },
  });

  assert.equal(upload.statusCode, 201);
  assert.equal(upload.value.upload.source_type, "baemin_orders_csv");
  assert.equal(upload.value.upload.accepted_count, 1);
  assert.equal(upload.value.upload.rejected_count, 0);
  assert.equal(upload.value.upload.metadata.xlsx_binary_supported, false);
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
    input: { mode: "seed", reason: "store_onboarding_bootstrap" },
  });
  assert.equal(collect.statusCode, 202);
  assert.equal(collect.value.collector_run.status, "completed");
  assert.equal(collect.value.collector_run.metadata.reason, "store_onboarding_bootstrap");
  assert.equal(collect.value.job_run.input_payload.reason, "store_onboarding_bootstrap");

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
  assert.equal(meta.value.pipeline_meta.latest_context_collection_reason, "store_onboarding_bootstrap");
  assert.equal(meta.value.pipeline_meta.data_reliability_note.includes("인과가 확정된 것"), true);
});

test("context collect validates collector filter and returns 202-shaped filtered result", async () => {
  const server = createTestServer();
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "filter-owner" });
  const storeId = stores.value.stores[0].store_id;

  const filtered = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub: "filter-owner",
    input: { mode: "live", collectors: ["kakao_geocoding", "kma_weather"] },
  });
  assert.equal(filtered.statusCode, 202);
  assert.equal(Array.isArray(filtered.value.summary.collectors), true);
  assert.deepEqual(filtered.value.summary.collectors.map((collector) => collector.name).sort(), ["kakao_geocoding", "kma_weather"]);
  assert.equal(typeof filtered.value.summary.completed_collector_count, "number");
  assert.equal(typeof filtered.value.summary.skipped_collector_count, "number");
  assert.equal(typeof filtered.value.summary.failed_collector_count, "number");

  const invalid = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub: "filter-owner",
    input: { mode: "live", collectors: ["unknown_collector"] },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.value.error.code, "bad_request");
});

test("context collect route still returns 202-shaped response when collectors fail partially", async () => {
  const baseStore = createRevenueOpsSaasStore();
  const server = createTestServer({
    revenueOpsSaasStore: {
      ...baseStore,
      collectContextForStore: async (storeId) => ({
        collector_run: {
          collector_run_id: "collector-partial",
          collector_name: "collectStorePublicContext",
          status: "failed",
          target_store_id: storeId,
          metadata: {},
        },
        job_run: {
          job_run_id: "job-partial",
          status: "failed",
          store_id: storeId,
        },
        summary: {
          completed_collector_count: 1,
          skipped_collector_count: 1,
          failed_collector_count: 1,
          timed_out_collector_count: 1,
          collectors: [
            { name: "kakao_geocoding", status: "completed", reason: null, duration_ms: 12 },
            { name: "kma_weather", status: "failed", reason: "request_timeout", duration_ms: 5000 },
            { name: "seoul_foot_traffic_proxy", status: "skipped", reason: "endpoint_not_configured", duration_ms: 0 },
          ],
        },
      }),
    },
  });
  const stores = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "partial-owner" });
  const storeId = stores.value.stores[0].store_id;

  const collect = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub: "partial-owner",
    input: { mode: "live" },
  });
  assert.equal(collect.statusCode, 202);
  assert.equal(collect.value.summary.completed_collector_count, 1);
  assert.equal(collect.value.summary.failed_collector_count, 1);
  assert.equal(collect.value.summary.collectors.find((collector) => collector.name === "kma_weather").reason, "request_timeout");
});

test("new store upload and context collect persist generated cause candidates and actions idempotently", async () => {
  const server = createTestServer();
  const authSub = "new-store-pipeline-owner";
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub,
    input: {
      store_name: "연남 테스트 카페",
      tenant_name: "Yeonnam Test Tenant",
      business_category: "CS100010",
      region: "Seoul Yeonnam",
      address_text: "서울 마포구 연남동",
      address_source: "search",
      address_selected: true,
    },
  });
  assert.equal(created.statusCode, 201);
  const storeId = created.value.store.store_id;

  const upload = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub,
    input: {
      source_type: "manual_template",
      original_filename: "new_store_seed.json",
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
        {
          business_date: "2026-05-02",
          channel: "offline_pos",
          gross_sales_amount: 1520000,
          net_sales_amount: 1460000,
          order_count: 121,
          cancel_count: 1,
          refund_amount: 8000,
          discount_amount: 52000,
          payment_card_amount: 1320000,
          payment_cash_amount: 90000,
        },
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
  assert.equal(upload.value.upload.status, "accepted");

  const firstCollect = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub,
    input: { mode: "seed" },
  });
  assert.equal(firstCollect.statusCode, 202);

  const firstContext = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context`,
    authSub,
  });
  const firstContextSummary = contextSummary(firstContext.value.context[0]);

  const secondCollect = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context/collect`,
    authSub,
    input: { mode: "seed" },
  });
  assert.equal(secondCollect.statusCode, 202);

  const secondContext = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/context`,
    authSub,
  });
  assert.deepEqual(contextSummary(secondContext.value.context[0]), firstContextSummary);

  const firstCandidates = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/cause-candidates`,
    authSub,
  });
  assert.equal(firstCandidates.statusCode, 200);
  assert.equal(firstCandidates.value.cause_candidates.length > 0, true);
  assert.ok(firstCandidates.value.cause_candidates[0].evidence.length > 0);

  const secondCandidates = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/cause-candidates`,
    authSub,
  });
  assert.equal(secondCandidates.value.cause_candidates.length, firstCandidates.value.cause_candidates.length);

  const firstActions = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub,
  });
  assert.equal(firstActions.statusCode, 200);
  assert.equal(firstActions.value.actions.length > 0, true);
  assert.ok(firstActions.value.actions[0].cause_candidate);
  assert.equal(firstActions.value.actions[0].status, "recommended");

  const secondActions = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions`,
    authSub,
  });
  assert.equal(secondActions.value.actions.length, firstActions.value.actions.length);

  const patched = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/actions/${encodeURIComponent(firstActions.value.actions[0].action_id)}/status`,
    authSub,
    input: { status: "done" },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.value.action.status, "done");
  assert.equal(patched.value.action.outcome_tracking.summary.includes("결과 추적 대기 중"), true);
});

test("PATCH /stores/{id} updates owner-managed fields and rejects address typed without search", async () => {
  const server = createTestServer();
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "edit-owner",
    input: {
      store_name: "최초 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  assert.equal(created.statusCode, 201);
  const storeId = created.value.store.store_id;

  const updated = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}`,
    authSub: "edit-owner",
    input: {
      store_name: "리뉴얼 매장",
      business_category: "CS100007",
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.value.store.store_name, "리뉴얼 매장");
  assert.equal(updated.value.store.business_category, "CS100007");

  const typedOnly = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}`,
    authSub: "edit-owner",
    input: { address_text: "임의로 입력한 주소" },
  });
  assert.equal(typedOnly.statusCode, 400);
  assert.equal(typedOnly.value.error.code, "INVALID_STORE_INPUT");

  const otherUser = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}`,
    authSub: "not-the-owner",
    input: { store_name: "탈취 시도" },
  });
  assert.equal(otherUser.statusCode, 403);
});

test("DELETE /stores/{id} archives the store and hides it from default list", async () => {
  const server = createTestServer();
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub: "archive-owner",
    input: {
      store_name: "철수 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  const storeId = created.value.store.store_id;

  const archived = await requestJson({
    server,
    method: "DELETE",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}`,
    authSub: "archive-owner",
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.value.store.status, "archived");

  const list = await requestJson({ server, method: "GET", routePath: "/api/v1/stores", authSub: "archive-owner" });
  assert.equal(list.value.stores.some((store) => store.store_id === storeId), false);
});

test("/briefs uses latest accepted upload period and dedupes top_cause_candidates", async () => {
  const server = createTestServer();
  const authSub = "brief-owner";
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub,
    input: {
      store_name: "브리프 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  const storeId = created.value.store.store_id;

  const days = [];
  for (let i = 0; i < 4; i += 1) {
    const date = new Date(Date.UTC(2026, 1, 8 + i));
    days.push({
      business_date: date.toISOString().slice(0, 10),
      channel: "offline_pos",
      gross_sales_amount: 1200000 + i * 5000,
      net_sales_amount: 1100000 + i * 5000,
      order_count: 80 + i,
    });
  }
  const upload = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub,
    input: {
      source_type: "manual_template",
      original_filename: "brief.json",
      daily_rows: days,
    },
  });
  assert.equal(upload.statusCode, 201);

  const briefs = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub,
  });
  assert.equal(briefs.statusCode, 200);
  assert.equal(briefs.value.briefs.length, 1);
  const brief = briefs.value.briefs[0];
  assert.equal(brief.period_label.includes("2024Q4"), false);
  assert.equal(brief.period_label, `${days[0].business_date} ~ ${days[3].business_date}`);
  assert.equal(brief.period_start, days[0].business_date);
  assert.equal(brief.period_end, days[3].business_date);
  assert.equal(brief.insufficient_data, false);
  assert.equal(brief.revenue_summary.days_in_period, 4);

  const summaryKeys = brief.top_cause_candidates.map((cand) => `${cand.candidate_type}::${(cand.summary || "").trim()}`);
  assert.equal(new Set(summaryKeys).size, summaryKeys.length, "top_cause_candidates must be deduped");

  const actionKeys = brief.recommended_actions.map((act) => `${act.action_type || act.action_family}::${(act.title || "").trim()}`);
  assert.equal(new Set(actionKeys).size, actionKeys.length, "recommended_actions must be deduped");

  // Caution-text sanitizer: no doubled "인과가 확정된 것은 아닙니다" phrase.
  const cautionRe = /인과가 확정된 것은 아닙니다(\.?\s*인과가 확정된 것은 아닙니다)/;
  assert.equal(cautionRe.test(brief.summary), false);
  for (const cand of brief.top_cause_candidates) {
    assert.equal(cautionRe.test(cand.summary || ""), false);
  }
});

test("1-row upload reports insufficient_data; 90-row upload supersedes the 1-row state", async () => {
  const server = createTestServer();
  const authSub = "rebuild-owner";
  const created = await requestJson({
    server,
    method: "POST",
    routePath: "/api/v1/stores",
    authSub,
    input: {
      store_name: "재빌드 매장",
      business_category: "CS100010",
      address_text: "서울 마포구 합정동",
      address_source: "search",
      address_selected: true,
    },
  });
  const storeId = created.value.store.store_id;

  const oneRow = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub,
    input: {
      source_type: "manual_template",
      original_filename: "one.json",
      daily_rows: [{
        business_date: "2026-02-08",
        channel: "offline_pos",
        gross_sales_amount: 600000,
        net_sales_amount: 540000,
        order_count: 40,
      }],
    },
  });
  assert.equal(oneRow.statusCode, 201);

  const briefAfterOne = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub,
  });
  assert.equal(briefAfterOne.value.briefs[0].insufficient_data, true);
  assert.match(briefAfterOne.value.briefs[0].headline, /1일치 매출이 등록되었습니다/);

  // Now upload 90 rows. The 1-row generated cause candidates must be
  // superseded so /cause-candidates reflects the latest upload window.
  const ninety = [];
  for (let i = 0; i < 90; i += 1) {
    const date = new Date(Date.UTC(2026, 1, 8 + i));
    ninety.push({
      business_date: date.toISOString().slice(0, 10),
      channel: "offline_pos",
      gross_sales_amount: 1100000 + i * 100,
      net_sales_amount: 1000000 + i * 100,
      order_count: 70 + (i % 5),
    });
  }
  const ninetyRow = await requestJson({
    server,
    method: "POST",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`,
    authSub,
    input: {
      source_type: "generic_pos_csv",
      original_filename: "revenue_daily_3months_realistic_cafe.csv",
      daily_rows: ninety,
    },
  });
  assert.equal(ninetyRow.statusCode, 201);
  assert.equal(ninetyRow.value.upload.accepted_count, 90);

  const briefAfterNinety = await requestJson({
    server,
    method: "GET",
    routePath: `/api/v1/stores/${encodeURIComponent(storeId)}/briefs`,
    authSub,
  });
  assert.equal(briefAfterNinety.value.briefs[0].insufficient_data, false);
  assert.equal(briefAfterNinety.value.briefs[0].period_start, "2026-02-08");
  assert.equal(briefAfterNinety.value.briefs[0].period_end, ninety[89].business_date);
});

test("evidence quality gate: null metric_value and rainfall_mm=0 are not promoted as cause candidates", async () => {
  const { createRevenueOpsSaasStore: createSaasStore } = require("./revenue-ops-saas-store");
  const store = createSaasStore();
  const user = store.resolveAppUserFromJwtClaims({ sub: "quality-gate", email: "qg@example.com" });
  const created = store.createStoreForUser(user.app_user_id, {
    store_name: "품질 게이트 매장",
    business_category: "CS100010",
    address_text: "서울 마포구 합정동",
    address_source: "search",
    address_selected: true,
  });
  const storeId = created.store_id;

  // Inject one upload + facts directly so cause/action loop runs against them.
  store.ingestRevenueUpload({
    appUserId: user.app_user_id,
    storeId,
    payload: {
      source_type: "manual_template",
      original_filename: "facts.json",
      daily_rows: [
        { business_date: "2026-02-08", channel: "offline_pos", gross_sales_amount: 1, net_sales_amount: 1, order_count: 1 },
        { business_date: "2026-02-09", channel: "offline_pos", gross_sales_amount: 2, net_sales_amount: 2, order_count: 2 },
      ],
    },
  });

  // Inject low-quality evidence rows directly into state.
  const stateRef = store._state;
  const causeId = stateRef.causeCandidates.find((row) => row.store_id === storeId)?.cause_candidate_id;
  if (causeId) {
    stateRef.causeEvidence.push({
      evidence_id: "evi_null_metric",
      cause_candidate_id: causeId,
      evidence_type: "weather",
      strength: "weak",
      summary: "metric_value 없음",
      metric_name: "rainfall_mm",
      metric_value: null,
      created_at: new Date().toISOString(),
    });
    stateRef.causeEvidence.push({
      evidence_id: "evi_zero_rain",
      cause_candidate_id: causeId,
      evidence_type: "weather",
      strength: "weak",
      summary: "비 0mm",
      metric_name: "rainfall_mm",
      metric_value: 0,
      created_at: new Date().toISOString(),
    });
  }

  const candidates = store.getCauseCandidatesForStore(storeId);
  for (const candidate of candidates) {
    for (const evi of candidate.evidence ?? []) {
      assert.notEqual(evi.metric_value, null);
      if (evi.metric_name === "rainfall_mm") {
        assert.notEqual(Number(evi.metric_value), 0);
      }
    }
  }
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
  assert.equal(martRows.some((row) => row.sales_delta_vs_prev_weekday_pct !== null), true);

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

  const actions = await store.getActionsForStore(storeId);
  const outcome = store.buildActionOutcomeForStore(storeId, actions[0].action_id);
  assert.equal(outcome.summary, "결과 추적 대기 중");
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

function createTestServer(overrides = {}) {
  return createServer({
    changeStore: {},
    eventStore: {},
    issueStore: {},
    runStore: {},
    traceStore: {},
    revenueOpsStore: createRevenueOpsStore(),
    revenueOpsSaasStore: createRevenueOpsSaasStore(),
    logger: createSilentLogger(),
    ...overrides,
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

function contextSummary(context) {
  return {
    observations: context.context_observations.length,
    mappings: context.commercial_area_mappings.length,
    snapshots: context.nearby_store_snapshots.length,
  };
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
