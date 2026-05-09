const test = require("node:test");
const assert = require("node:assert/strict");

const { composeBriefFromUploadedFacts } = require("./revenue-ops-saas-store");

test("composeBriefFromUploadedFacts normalizes Date business_date values to YYYY-MM-DD", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store_date_normalization",
    store: {
      store_name: "날짜 정규화 테스트 매장",
      region: "서울",
      business_category: "CS100010",
    },
    latestUpload: {
      upload_id: "upload_date_normalization",
    },
    facts: [
      {
        business_date: new Date("2026-05-08T00:00:00.000Z"),
        net_sales_amount: 300000,
        order_count: 30,
      },
      {
        business_date: "Fri Apr 03 2026 00:00:00 GMT+0000 (Coordinated Universal Time)",
        net_sales_amount: 200000,
        order_count: 20,
      },
      {
        business_date: "2026-02-08",
        net_sales_amount: 100000,
        order_count: 10,
      },
    ],
  });

  assert.ok(brief);
  assert.equal(brief.period_label, "2026-02-08 ~ 2026-05-08");
  assert.equal(brief.period_start, "2026-02-08");
  assert.equal(brief.period_end, "2026-05-08");
  assert.equal(brief.revenue_summary.days_in_period, 3);
  assert.deepEqual(
    brief.daily_series.map((point) => point.date),
    ["2026-02-08", "2026-04-03", "2026-05-08"],
  );
  assert.equal(brief.daily_series[0].net_sales, 100000);
  assert.equal(brief.daily_series[2].order_count, 30);
});

test("composeBriefFromUploadedFacts promotes real collector observations into cause candidates with source metadata", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store-collector-promotion",
    store: { store_name: "성수 카페", region: "서울 성동구", business_category: "CS100010" },
    facts: [
      { business_date: "2026-02-08", net_sales_amount: 1000000, order_count: 100 },
      { business_date: "2026-05-08", net_sales_amount: 1200000, order_count: 110 },
    ],
    causeCandidates: [],
    causeEvidence: [],
    actions: [],
    latestCollectorRun: {
      metadata: {
        collectors: [
          { name: "kma_weather", status: "completed", observation_count: 7, source_name: "기상청 ASOS", collected_at: "2026-05-08T00:00:00.000Z" },
          { name: "korean_holiday_calendar", status: "completed", observation_count: 4, source_name: "Korean Astronomy Holiday API", collected_at: "2026-05-08T00:00:00.000Z" },
          { name: "local_event_context", status: "completed", observation_count: 0, source_name: "Seoul Open Data local event", collected_at: "2026-05-08T00:00:00.000Z" },
          { name: "naver_search_trend", status: "failed", observation_count: 0, source_name: "Naver DataLab" },
        ],
      },
    },
  });
  assert.ok(brief);
  const candidates = brief.top_cause_candidates;
  const types = candidates.map((c) => c.candidate_type);
  // Real KMA weather observation promotes to a kma_weather_context candidate.
  assert.ok(types.includes("kma_weather_context"), `expected kma_weather_context in ${JSON.stringify(types)}`);
  // Holiday observations promote to calendar_context.
  assert.ok(types.includes("calendar_context"));
  // observation_count=0 must NOT generate a local_event_context candidate.
  assert.equal(types.includes("local_event_context"), false);
  // failed collector must NOT generate a search_demand_context candidate.
  assert.equal(types.includes("search_demand_context"), false);
  // Source metadata is attached on the evidence row.
  const weatherCandidate = candidates.find((c) => c.candidate_type === "kma_weather_context");
  assert.equal(weatherCandidate.created_from, "context_collector");
  const evidence = weatherCandidate.evidence[0];
  assert.equal(evidence.source_name, "기상청 ASOS");
  assert.equal(evidence.metadata.collector_id, "kma_weather");
  assert.equal(evidence.metadata.collector_status, "completed");
  assert.equal(evidence.metadata.observed_period, "2026-02-08 ~ 2026-05-08");
  assert.equal(evidence.metadata.last_collected_at, "2026-05-08T00:00:00.000Z");
});

test("composeBriefFromUploadedFacts promotes collectors when latestCollectorRun.metadata is a JSON string", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store-jsonstring",
    store: { store_name: "성수 카페" },
    facts: [
      { business_date: "2026-02-08", net_sales_amount: 1000000, order_count: 100 },
      { business_date: "2026-05-08", net_sales_amount: 1100000, order_count: 110 },
    ],
    causeCandidates: [],
    causeEvidence: [],
    actions: [],
    latestCollectorRun: {
      metadata: JSON.stringify({
        collectors: [
          { name: "kma_weather", status: "completed", observation_count: 3, source_name: "기상청 ASOS", collected_at: "2026-05-08T00:00:00.000Z" },
          { name: "korean_holiday_calendar", status: "completed", observation_count: 4, source_name: "Korean Astronomy Holiday API", collected_at: "2026-05-08T00:00:00.000Z" },
        ],
      }),
    },
  });
  const types = brief.top_cause_candidates.map((c) => c.candidate_type);
  assert.ok(types.includes("kma_weather_context"));
  assert.ok(types.includes("calendar_context"));
});

test("composeBriefFromUploadedFacts promotes collectors when array is under run.summary.collectors", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store-summary-collectors",
    store: { store_name: "성수 카페" },
    facts: [
      { business_date: "2026-02-08", net_sales_amount: 1000000, order_count: 100 },
      { business_date: "2026-05-08", net_sales_amount: 1100000, order_count: 110 },
    ],
    causeCandidates: [],
    causeEvidence: [],
    actions: [],
    latestCollectorRun: {
      summary: {
        collectors: [
          { name: "naver_search_trend", status: "completed", observation_count: 1, source_name: "Naver DataLab", collected_at: "2026-05-08T00:00:00.000Z" },
          { name: "local_event_context", status: "completed", observation_count: 0, source_name: "Seoul Open Data local event" },
          { name: "kma_weather", status: "failed", observation_count: 0 },
        ],
      },
    },
  });
  const types = brief.top_cause_candidates.map((c) => c.candidate_type);
  // Naver completed with observation_count=1 → search_demand_context promoted.
  assert.ok(types.includes("search_demand_context"));
  // local_event_context completed with observation_count=0 → not promoted.
  assert.equal(types.includes("local_event_context"), false);
  // kma_weather failed → not promoted.
  assert.equal(types.includes("kma_weather_context"), false);
});

test("composeBriefFromUploadedFacts suppresses seed_rule weather candidate when KMA weather collector promoted real evidence", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store-supersede",
    store: { store_name: "성수 카페", region: "서울 성동구", business_category: "CS100010" },
    facts: [
      { business_date: "2026-02-08", net_sales_amount: 1000000, order_count: 100 },
      { business_date: "2026-05-08", net_sales_amount: 1200000, order_count: 110 },
    ],
    causeCandidates: [
      {
        cause_candidate_id: "seed_weather_1",
        candidate_type: "rainy_day_offline_drop",
        title: "비 오는 날 오프라인 주문 하락 가능성",
        summary: "비 오는 날과 오프라인 주문 하락이 함께 관측되었습니다.",
        status: "active",
        created_from: "seed_rule",
      },
    ],
    causeEvidence: [
      { evidence_id: "evi_seed_weather", cause_candidate_id: "seed_weather_1", evidence_type: "weather", strength: "medium", summary: "manual seed", source_name: "Manual seed weather context", source_ref: "manual_seed_weather", metric_value: 38, metric_name: "rainfall_mm", metadata: { not_proven_causality: true } },
    ],
    actions: [],
    latestCollectorRun: {
      metadata: {
        collectors: [
          { name: "kma_weather", status: "completed", observation_count: 5, source_name: "기상청 ASOS", collected_at: "2026-05-08T00:00:00.000Z" },
        ],
      },
    },
  });
  const sourceNames = brief.top_cause_candidates.flatMap((c) => c.evidence.map((e) => e.source_name));
  assert.ok(sourceNames.includes("기상청 ASOS"), `expected real KMA source, got ${JSON.stringify(sourceNames)}`);
  assert.equal(sourceNames.includes("Manual seed weather context"), false);
});
