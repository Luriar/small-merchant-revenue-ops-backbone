const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectKakaoStoreLocation,
  collectKmaWeather,
  collectSeoulCommercialBenchmark,
  collectSeoulFootTrafficProxy,
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
  assert.equal(plan.collectors.find((collector) => collector.collector_name === "kma_weather").status, "live_ready");
  assert.equal(plan.collectors.find((collector) => collector.collector_name === "kakao_geocoding").status, "skipped_missing_key");
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
    seoulOpenDataBaseUrl: "http://openapi.seoul.go.kr:8088",
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

test("Kakao and KMA collectors return failed request_timeout when fetch hangs", async () => {
  const store = {
    store_id: "store-timeout",
    address_text: "서울 성동구 성수동",
    region: "Seoul Seongsu",
    business_category: "cafe",
  };

  const kakao = await collectKakaoStoreLocation(store, { kakaoRestApiKey: "kakao-secret" }, {
    fetchImpl: neverResolvingFetch(),
    timeoutMs: 5,
  });
  assert.equal(kakao.status, "failed");
  assert.equal(kakao.reason, "request_timeout");
  assert.equal(kakao.observation_count, 0);
  assert.equal(kakao.duration_ms >= 0, true);

  const kma = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/kma",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    env: {},
    fetchImpl: neverResolvingFetch(),
    timeoutMs: 5,
  });
  assert.equal(kma.status, "failed");
  assert.equal(kma.reason, "request_timeout");
  assert.equal(kma.observation_count, 0);
});

test("Seoul timeout fails only that collector and other collectors continue", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu", business_category: "cafe" };
  const commercial = await collectSeoulCommercialBenchmark(store, {
    seoulOpenDataKey: "seoul-secret",
    seoulCommercialSalesEndpoint: "CommercialSales",
  }, {
    fetchImpl: neverResolvingFetch(),
    timeoutMs: 5,
  });
  assert.equal(commercial.status, "failed");
  assert.equal(commercial.reason, "request_timeout");

  const footTraffic = await collectSeoulFootTrafficProxy(store, {
    seoulOpenDataKey: "seoul-secret",
  }, {
    fetchImpl: mockJsonFetch({}),
    timeoutMs: 5,
  });
  assert.equal(footTraffic.status, "skipped");
  assert.equal(footTraffic.reason, "endpoint_not_configured");
});

test("live collection supports mixed results, collector filter, and safe source refs", async () => {
  const store = {
    store_id: "store-mixed",
    address_text: "서울 성동구 성수동",
    region: "Seoul Seongsu",
    business_category: "cafe",
  };
  const credentials = {
    kakaoRestApiKey: "kakao-secret",
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/kma",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
    seoulOpenDataKey: "seoul-secret",
    seoulCommercialSalesEndpoint: "CommercialSales",
  };
  const result = await collectStorePublicContext({
    store,
    mode: "live",
    env: {
      KAKAO_COLLECTOR_TIMEOUT_MS: "50",
      KMA_COLLECTOR_TIMEOUT_MS: "50",
      SEOUL_COLLECTOR_TIMEOUT_MS: "5",
      PUBLIC_CONTEXT_GLOBAL_BUDGET_MS: "500",
    },
    credentials,
    fetchImpl: mixedFetch({
      kakaoBody: {
        documents: [{
          x: "127.0557",
          y: "37.5446",
          address_name: "서울 성동구 성수동",
          address: { region_2depth_name: "성동구", region_3depth_name: "성수동" },
          road_address: { address_name: "서울 성동구 성수로" },
        }],
      },
      kmaText: JSON.stringify({
        response: { body: { items: { item: [{ category: "RN1", obsrValue: "2.1" }] } } },
      }),
    }),
  });

  assert.equal(result.completed_collector_count, 2);
  assert.equal(result.skipped_collector_count, 2);
  assert.equal(result.failed_collector_count, 1);
  assert.equal(result.timed_out_collector_count, 1);
  assert.equal(result.collectors.find((collector) => collector.name === "seoul_commercial_benchmark").reason, "request_timeout");
  assert.equal(JSON.stringify(result).includes("kakao-secret"), false);
  assert.equal(JSON.stringify(result).includes("kma-secret"), false);
  assert.equal(JSON.stringify(result).includes("seoul-secret"), false);

  const filtered = await collectStorePublicContext({
    store,
    mode: "live",
    env: {
      KAKAO_COLLECTOR_TIMEOUT_MS: "50",
      KMA_COLLECTOR_TIMEOUT_MS: "50",
      PUBLIC_CONTEXT_GLOBAL_BUDGET_MS: "500",
    },
    credentials,
    collectors: ["kakao_geocoding", "kma_weather"],
    fetchImpl: mixedFetch({
      kakaoBody: { documents: [{ x: "127", y: "37", address: {}, road_address: {} }] },
      kmaText: JSON.stringify({ response: { body: { items: { item: [{ category: "T1H", obsrValue: "20" }] } } } }),
    }),
  });
  assert.deepEqual(filtered.collectors.map((collector) => collector.name).sort(), ["kakao_geocoding", "kma_weather"]);
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

function neverResolvingFetch() {
  return async () => new Promise(() => {});
}

function mixedFetch({ kakaoBody, kmaText }) {
  return async (url) => {
    const textUrl = String(url);
    if (textUrl.includes("dapi.kakao.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => kakaoBody,
        text: async () => JSON.stringify(kakaoBody),
      };
    }
    if (textUrl.includes("kma")) {
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(kmaText),
        text: async () => kmaText,
      };
    }
    if (textUrl.includes("CommercialSales")) {
      return new Promise(() => {});
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ row: [] }),
      text: async () => JSON.stringify({ row: [] }),
    };
  };
}
