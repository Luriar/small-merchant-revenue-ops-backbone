const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectKakaoStoreLocation,
  collectKmaWeather,
  collectSeoulCommercialBenchmark,
  collectStorePublicContext,
  parseKmaWeatherResponse,
  planStorePublicContextCollection,
} = require("./context-collectors");
const {
  loadPublicContextCredentials,
  loadPublicContextCredentialsFromEnv,
  maskCredentialForLog,
} = require("./public-context-credentials");

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

test("public context credentials load from env and mask values for logs", () => {
  const credentials = loadPublicContextCredentialsFromEnv({
    KAKAO_REST_API_KEY: "kakao-secret-value",
    DATA_GO_KR_SERVICE_KEY: "data-go-secret",
    KMA_NOWCAST_ENDPOINT: "https://example.test/kma",
  });
  assert.equal(credentials.credentialSource, "env");
  assert.equal(credentials.kakaoRestApiKey, "kakao-secret-value");
  assert.equal(credentials.kmaServiceKey, "data-go-secret");
  assert.equal(maskCredentialForLog(credentials.kakaoRestApiKey), "kak...lue");
});

test("public context credentials load from mocked Secrets Manager without network", async () => {
  const credentials = await loadPublicContextCredentials({
    env: { PUBLIC_CONTEXT_SECRET_ID: "/example/public-context" },
    getSecretString: async () => JSON.stringify({
      KAKAO_REST_API_KEY: "kakao-from-secret",
      SEOUL_OPEN_DATA_KEY: "seoul-from-secret",
      KMA_SERVICE_KEY: "kma-from-secret",
    }),
  });
  assert.equal(credentials.credentialSource, "secrets_manager");
  assert.equal(credentials.kakaoRestApiKey, "kakao-from-secret");
  assert.equal(credentials.seoulOpenDataKey, "seoul-from-secret");
  assert.equal(credentials.kmaServiceKey, "kma-from-secret");
});

test("Kakao collector skips missing key and resolves mocked address without exposing key", async () => {
  const store = {
    store_id: "store-1",
    store_name: "테스트 카페",
    address_text: "서울 성동구 성수동",
    region: "Seoul Seongsu",
    business_category: "cafe",
  };
  const skipped = await collectKakaoStoreLocation(store, {}, { fetchImpl: mockJsonFetch({}) });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "missing_key");

  const completed = await collectKakaoStoreLocation(store, { kakaoRestApiKey: "secret-kakao-key" }, {
    fetchImpl: mockJsonFetch({
      documents: [{
        x: "127.0557",
        y: "37.5446",
        address_name: "서울 성동구 성수동",
        address: {
          region_1depth_name: "서울",
          region_2depth_name: "성동구",
          region_3depth_name: "성수동",
        },
        road_address: { address_name: "서울 성동구 성수로" },
      }],
    }),
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.store_location.latitude, 37.5446);
  assert.equal(completed.observations[0].source_ref.includes("secret-kakao-key"), false);
  assert.equal(completed.observations[0].metadata.not_proven_causality, true);
});

test("KMA collector handles JSON/XML and skips incomplete live config", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  const skipped = await collectKmaWeather(store, { kmaServiceKey: "kma-key", kmaNowcastEndpoint: "/now" }, {
    env: {},
    fetchImpl: mockTextFetch("{}"),
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "missing_base_url");

  const completed = await collectKmaWeather(store, {
    kmaServiceKey: "kma-key",
    kmaNowcastEndpoint: "https://example.test/kma",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    env: {},
    latestRevenueDate: "2026-05-01",
    fetchImpl: mockTextFetch(JSON.stringify({
      response: {
        body: {
          items: {
            item: [
              { category: "RN1", obsrValue: "3.5" },
              { category: "T1H", obsrValue: "19.2" },
            ],
          },
        },
      },
    })),
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.observations.length, 2);
  assert.equal(completed.observations[0].source_ref.includes("kma-key"), false);

  const xmlItems = parseKmaWeatherResponse("<response><body><items><item><category>RN1</category><obsrValue>1.2</obsrValue></item></items></body></response>");
  assert.equal(xmlItems.length, 1);
  assert.equal(xmlItems[0].category, "RN1");
});

test("Seoul collector skips missing endpoint and normalizes mocked commercial benchmark", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu", business_category: "cafe" };
  const skipped = await collectSeoulCommercialBenchmark(store, { seoulOpenDataKey: "seoul-key" }, { fetchImpl: mockJsonFetch({}) });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.reason, "endpoint_not_configured");

  const completed = await collectSeoulCommercialBenchmark(store, {
    seoulOpenDataKey: "seoul-key",
    seoulCommercialSalesEndpoint: "CommercialSales",
    seoulOpenDataBaseUrl: "https://openapi.seoul.go.kr:8088",
  }, {
    fetchImpl: mockJsonFetch({
      CommercialSales: {
        row: [{
          SALES_DELTA_PCT: "-8.1",
          SALES_AMOUNT: "148000000",
          TRANSACTION_COUNT: "14800",
          TRDAR_CD: "seed-area",
          YM: "202604",
        }],
      },
    }),
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.observations[0].metric_value, -8.1);
  assert.equal(completed.benchmarks[0].avg_transaction_value, 10000);
  assert.equal(completed.observations[0].source_ref.includes("seoul-key"), false);
});

test("auto live collection falls back safely when all live collectors skip", async () => {
  const result = await collectStorePublicContext({
    store: { store_id: "store-1", region: "Seoul Seongsu", business_category: "cafe" },
    mode: "auto",
    env: {},
    credentials: {},
    fetchImpl: mockJsonFetch({}),
  });
  assert.equal(result.resolved_mode, "seed");
  assert.equal(result.seed_fallback_recommended, true);
  assert.equal(result.collectors.every((collector) => collector.status === "skipped"), true);
});

function mockJsonFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockTextFetch(bodyText, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  });
}
