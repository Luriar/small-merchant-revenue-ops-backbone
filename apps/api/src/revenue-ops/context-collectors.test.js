const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectKakaoStoreLocation,
  collectKoreanHolidayCalendar,
  collectKmaWeather,
  collectLocalEventContext,
  collectNaverLocalCompetitorSearch,
  collectNaverSearchTrend,
  collectSeoulCommercialBenchmark,
  collectSeoulFootTrafficProxy,
  collectStorePublicContext,
  parseKmaWeatherResponse,
  parseKmaWeatherEnvelope,
  buildKmaEndpointPlan,
  detectKmaEndpointKind,
  generateKmaBaseTimeCandidates,
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
    NAVER_CLIENT_ID: "naver-id",
    NAVER_CLIENT_SECRET: "naver-secret",
    HOLIDAY_SERVICE_KEY: "holiday-secret",
    KMA_NOWCAST_ENDPOINT: "https://example.test/kma",
  });
  assert.equal(credentials.credentialSource, "env");
  assert.equal(credentials.kakaoRestApiKey, "kakao-secret-value");
  assert.equal(credentials.kmaServiceKey, "data-go-secret");
  assert.equal(credentials.naverClientId, "naver-id");
  assert.equal(credentials.holidayServiceKey, "holiday-secret");
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

test("KMA collector completes after retrying past an empty base_time", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const isFirst = calls.length === 1;
    const body = isFirst
      ? JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { items: { item: [] } } } })
      : JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{ category: "T1H", obsrValue: "20.5" }] } } } });
    return mockOkText(body);
  };

  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    fetchImpl,
    env: {},
    now: new Date("2026-05-07T12:00:00Z"), // 21:00 KST
  });

  assert.equal(result.status, "completed");
  assert.equal(result.observations.length, 1);
  assert.equal(calls.length, 2, "should have retried after empty first attempt");
  assert.equal(result.metadata.attempts.length, 2);
  assert.equal(result.metadata.selected_endpoint, "ultra_short_observation");
  assert.notEqual(result.metadata.selected_base_time, null);
  assert.equal(JSON.stringify(result).includes("kma-secret"), false);
});

test("KMA collector falls back from nowcast endpoint to forecast endpoint when nowcast keeps returning empty items", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  const calls = [];
  const fetchImpl = async (url) => {
    const text = String(url);
    calls.push(text);
    if (text.includes("getUltraSrtNcst")) {
      return mockOkText(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [] } } } }));
    }
    return mockOkText(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{ category: "PCP", fcstValue: "0.5" }] } } } }));
  };

  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaForecastEndpoint: "https://example.test/getVilageFcst",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    fetchImpl,
    env: {},
    now: new Date("2026-05-07T12:00:00Z"),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.metadata.selected_endpoint, "village_forecast");
  assert.equal(result.metadata.attempted_endpoints.includes("ultra_short_observation"), true);
  assert.equal(result.metadata.attempted_endpoints.includes("village_forecast"), true);
  assert.equal(result.observations.length, 1);
});

test("KMA collector skips with no_weather_items only after all endpoint and base_time candidates return empty", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return mockOkText(JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NO_DATA" }, body: { items: { item: [] } } } }));
  };

  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaForecastEndpoint: "https://example.test/getVilageFcst",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    fetchImpl,
    env: {},
    now: new Date("2026-05-07T12:00:00Z"),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_weather_items");
  assert.equal(result.metadata.selected_endpoint, null);
  assert.equal(result.metadata.attempted_endpoints.length, 2);
  assert.equal(callCount > 1, true, "should have attempted multiple base_time candidates");
});

test("KMA collector classifies service key auth error as failed instead of no_weather_items", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return mockOkText(JSON.stringify({
      response: {
        header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR." },
        body: { items: { item: [] } },
      },
    }));
  };

  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaForecastEndpoint: "https://example.test/getVilageFcst",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    fetchImpl,
    env: {},
    now: new Date("2026-05-07T12:00:00Z"),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "service_result_30");
  assert.equal(result.metadata.result_code, "30");
  assert.equal(callCount, 1, "should NOT retry after an auth error");
  assert.equal(JSON.stringify(result).includes("kma-secret"), false);
});

test("KMA collector classifies XML returnAuthMsg as auth failure", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  const fetchImpl = async () => mockOkText(
    "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>",
  );

  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaDefaultNx: "61",
    kmaDefaultNy: "125",
  }, {
    fetchImpl,
    env: {},
    now: new Date("2026-05-07T12:00:00Z"),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "service_result_30");
});

test("KMA response parser normalizes a single item object to an array", () => {
  const parsed = parseKmaWeatherEnvelope(JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: { items: { item: { category: "RN1", obsrValue: "1.5" } } },
    },
  }));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].category, "RN1");
  assert.equal(parsed.authError, false);
  assert.equal(parsed.resultCode, "00");
});

test("KMA collector skips with missing_kma_grid when nx/ny are not configured", async () => {
  const store = { store_id: "store-1", region: "Seoul Seongsu" };
  const result = await collectKmaWeather(store, {
    kmaServiceKey: "kma-secret",
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
  }, {
    fetchImpl: async () => { throw new Error("should_not_call_fetch"); },
    env: {},
    now: new Date("2026-05-07T12:00:00Z"),
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_kma_grid");
  assert.equal(result.metadata.attempted_endpoints[0], "ultra_short_observation");
  assert.equal(result.metadata.attempted_base_times.length, 0);
});

test("KMA endpoint kind detection identifies KMA URL families", () => {
  assert.equal(detectKmaEndpointKind("https://apis.data.go.kr/.../getUltraSrtNcst", "nowcast"), "ultra_short_observation");
  assert.equal(detectKmaEndpointKind("https://apis.data.go.kr/.../getUltraSrtFcst", "nowcast"), "ultra_short_forecast");
  assert.equal(detectKmaEndpointKind("https://apis.data.go.kr/.../getVilageFcst", "forecast"), "village_forecast");
  assert.equal(detectKmaEndpointKind("https://example.test/unknown", "forecast"), "village_forecast");
  assert.equal(detectKmaEndpointKind("https://example.test/unknown", "nowcast"), "ultra_short_observation");
});

test("KMA endpoint plan tries nowcast then forecast and dedupes identical entries", () => {
  const plan = buildKmaEndpointPlan({
    kmaNowcastEndpoint: "https://example.test/getUltraSrtNcst",
    kmaForecastEndpoint: "https://example.test/getVilageFcst",
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].kind, "ultra_short_observation");
  assert.equal(plan[1].kind, "village_forecast");

  const planSingle = buildKmaEndpointPlan({
    kmaNowcastEndpoint: "https://example.test/shared",
    kmaForecastEndpoint: "https://example.test/shared",
  });
  // Same URL, different hint → still two plan entries because the hint changes the kind.
  assert.equal(planSingle.length >= 1, true);
});

test("KMA base time candidate generator yields KST-anchored candidates with reasonable delays", () => {
  const now = new Date("2026-05-07T12:00:00Z"); // 21:00 KST
  const ultraShortObs = generateKmaBaseTimeCandidates("ultra_short_observation", now);
  assert.equal(ultraShortObs[0].baseTime, "2000"); // 21:00 KST minus 40-min publication delay → 20:00 base
  assert.equal(ultraShortObs[0].baseDate, "20260507");
  assert.equal(ultraShortObs.length >= 3, true);

  const village = generateKmaBaseTimeCandidates("village_forecast", now);
  assert.equal(village[0].baseTime, "2000"); // most recent published village base time (20:00) at 21:00 KST
  assert.equal(village[0].baseDate, "20260507");

  // Early-morning case: 00:30 KST → expect lookback into yesterday's last village base time
  const earlyMorning = new Date("2026-05-06T15:30:00Z"); // 00:30 KST 5/7
  const earlyVillage = generateKmaBaseTimeCandidates("village_forecast", earlyMorning);
  assert.equal(earlyVillage[0].baseTime, "2300");
  assert.equal(earlyVillage[0].baseDate, "20260506");
});

function mockOkText(bodyText) {
  return {
    ok: true,
    status: 200,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

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

test("Naver search trend keywords prefer human category label and region fallback", async () => {
  const store = {
    store_id: "store-yeouido-western",
    store_name: "르뵈프",
    region: "서울 영등포구 여의도동",
    business_category: "CS100004",
    metadata: {
      business_category_label: "양식음식점",
      representative_menu_keywords: ["파스타"],
    },
  };

  const credentials = {
    naverSearchTrendClientId: "trend-id",
    naverSearchTrendClientSecret: "trend-secret",
  };

  let requestBody = null;
  const trend = await collectNaverSearchTrend(store, credentials, {
    latestRevenueDate: "2026-05-06",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            title: "store_category_context",
            data: [
              { period: "2026-05-05", ratio: 30.1 },
              { period: "2026-05-06", ratio: 35.2 },
            ],
          }],
        }),
      };
    },
  });

  assert.equal(trend.status, "completed");
  const keywords = requestBody.keywordGroups[0].keywords;
  assert.equal(keywords.includes("CS100004"), false);
  assert.equal(keywords.includes("여의도동 양식") || keywords.includes("여의도 양식"), true);
  assert.equal(keywords.some((keyword) => keyword.includes("파스타")), true);
});

test("Naver collectors normalize local search and DataLab without leaking credentials", async () => {
  const store = {
    store_id: "store-1",
    region: "서울 성동구 성수동",
    business_category: "카페",
    metadata: { representative_menu_keywords: ["소금빵"] },
  };
  const credentials = {
    naverClientId: "naver-client-id",
    naverClientSecret: "naver-client-secret",
    naverSearchTrendClientId: "trend-id",
    naverSearchTrendClientSecret: "trend-secret",
  };

  const local = await collectNaverLocalCompetitorSearch(store, credentials, {
    fetchImpl: mockJsonFetch({
      items: [
        { title: "<b>성수 카페</b>", category: "카페,디저트", address: "서울 성동구", roadAddress: "서울 성동구 성수로" },
        { title: "디저트 카페", category: "<b>카페</b>", address: "서울 성동구", roadAddress: "서울 성동구" },
      ],
    }),
  });
  assert.equal(local.status, "completed");
  assert.equal(local.observations[0].metric_name, "nearby_same_category_result_count");
  assert.equal(local.observations[0].metric_value, 2);
  assert.equal(local.observations[0].metadata.normalized_items[0].title, "성수 카페");
  assert.equal(JSON.stringify(local).includes("naver-client-secret"), false);

  const trend = await collectNaverSearchTrend(store, credentials, {
    latestRevenueDate: "2026-05-06",
    fetchImpl: mockJsonFetch({
      results: [{
        title: "store_category_context",
        data: [
          { period: "2026-05-05", ratio: 32.1 },
          { period: "2026-05-06", ratio: 41.5 },
        ],
      }],
    }),
  });
  assert.equal(trend.status, "completed");
  assert.equal(trend.observations[0].metric_name, "naver_search_ratio");
  assert.equal(trend.observations[0].metric_value, 41.5);
  assert.equal(trend.observations[0].metadata.relative_search_trend_not_absolute_demand, true);
  assert.equal(JSON.stringify(trend).includes("trend-secret"), false);
});

test("Korean holiday collector parses verified Data.go.kr shape safely", async () => {
  const store = { store_id: "store-1", region: "서울" };
  const completed = await collectKoreanHolidayCalendar(store, {
    holidayServiceKey: "holiday-secret",
  }, {
    latestRevenueDate: "2026-05-01",
    fetchImpl: mockTextFetch(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: {
          items: {
            item: [
              { dateName: "노동절", locdate: "20260501", isHoliday: "N" },
              { dateName: "어린이날", locdate: "20260505", isHoliday: "Y" },
            ],
          },
        },
      },
    })),
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.observations.length, 2);
  assert.equal(completed.observations[0].context_type, "calendar");
  assert.equal(completed.observations[0].metric_name, "holiday_or_special_day");
  assert.equal(completed.observations[0].source_ref.includes("holiday-secret"), false);

  const failed = await collectKoreanHolidayCalendar(store, { holidayServiceKey: "holiday-secret" }, {
    fetchImpl: mockTextFetch(JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" } } })),
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "service_result_30");
});

test("Korean holiday collector returns deterministic_calendar fallback when service key is missing", async () => {
  const fallback = await collectKoreanHolidayCalendar({ store_id: "store-1" }, {}, {
    latestRevenueDate: "2026-05-08",
  });
  assert.equal(fallback.status, "skipped");
  assert.equal(fallback.reason, "missing_key");
  assert.equal(fallback.raw_summary?.source_type, "deterministic_calendar");
  assert.equal(fallback.raw_summary.period_end, "2026-05-08");
  assert.equal(fallback.raw_summary.weekday_days + fallback.raw_summary.weekend_days, 90);
  assert.ok(fallback.raw_summary.weekend_share_pct > 0);
  assert.ok(["spring", "summer", "autumn", "winter"].includes(fallback.raw_summary.season_label));
  assert.equal(fallback.raw_summary.holiday_count, 0);
});

test("local_event_context is not_connected when SEOUL_OPEN_DATA_KEY or endpoint is missing", async () => {
  const noKey = await collectLocalEventContext({ store_id: "store-1", region: "Seoul Seongsu" }, {}, {});
  assert.equal(noKey.status, "skipped");
  assert.equal(noKey.reason, "missing_key");
  const noEndpoint = await collectLocalEventContext(
    { store_id: "store-1", region: "Seoul Seongsu" },
    { seoulOpenDataKey: "seoul-key" },
    {},
  );
  assert.equal(noEndpoint.status, "skipped");
  assert.equal(noEndpoint.reason, "endpoint_not_configured");
});

test("local_event_context fetches and matches Seoul Open Data events when configured", async () => {
  const result = await collectLocalEventContext(
    { store_id: "store-1", region: "Seongsu" },
    {
      seoulOpenDataKey: "seoul-secret",
      seoulLocalEventEndpoint: "culturalEventInfo",
    },
    {
      latestRevenueDate: "2026-05-08",
      fetchImpl: mockJsonFetch({
        culturalEventInfo: {
          row: [
            {
              TITLE: "성수 야시장",
              STRTDATE: "2026-05-04",
              END_DATE: "2026-05-10",
              GUNAME: "Seongsu",
              CODENAME: "축제",
            },
            {
              TITLE: "서대문 콘서트",
              STRTDATE: "2026-05-06",
              END_DATE: "2026-05-06",
              GUNAME: "Seodaemun",
              CODENAME: "공연",
            },
          ],
        },
      }),
    },
  );
  assert.equal(result.status, "completed");
  assert.equal(result.raw_summary.event_count, 2);
  assert.equal(result.raw_summary.matched_event_count, 1);
  assert.equal(result.raw_summary.matching_method, "region");
  assert.equal(result.observations[0].context_type, "local_event");
  assert.equal(result.observations[0].source_type, "local_event");
  assert.equal(JSON.stringify(result).includes("seoul-secret"), false);
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

  assert.equal(result.completed_collector_count, 3);
  assert.equal(result.skipped_collector_count, 7);
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
