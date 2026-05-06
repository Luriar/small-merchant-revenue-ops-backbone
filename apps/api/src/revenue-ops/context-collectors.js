const { createHash } = require("node:crypto");

const LIVE_KEY_NAMES = [
  "KMA_SERVICE_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "SEOUL_OPEN_DATA_KEY",
  "KAKAO_REST_API_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
];

const COLLECTOR_NAMES = [
  "kakao_geocoding",
  "kma_weather",
  "seoul_commercial_benchmark",
  "seoul_foot_traffic_proxy",
  "seoul_store_density_proxy",
];

const DEFAULT_TIMEOUTS = {
  kakao_geocoding: 4000,
  kma_weather: 5000,
  seoul_commercial_benchmark: 5000,
  seoul_foot_traffic_proxy: 5000,
  seoul_store_density_proxy: 5000,
  global_budget: 20000,
};

function getConfiguredContextKeys(env = process.env) {
  return LIVE_KEY_NAMES.filter((name) => Boolean(env[name]));
}

function planStorePublicContextCollection({ mode = "auto", env = process.env, credentials = null, collectors = null } = {}) {
  const collectorFilter = normalizeCollectorFilter(collectors);
  const configuredKeys = getConfiguredContextKeys(env);
  const liveAvailable = configuredKeys.length > 0 || hasAnyLiveCredential(credentials);
  const hasKma = Boolean(env.KMA_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY || credentials?.kmaServiceKey);
  const hasSeoul = Boolean(env.SEOUL_OPEN_DATA_KEY || credentials?.seoulOpenDataKey);
  const hasKakao = Boolean(env.KAKAO_REST_API_KEY || credentials?.kakaoRestApiKey);
  const resolvedMode = mode === "auto" ? (liveAvailable ? "live" : "seed") : mode;
  const plannedCollectors = [
    collectorPlan("kakao_geocoding", resolvedMode, hasKakao, "Kakao Local API"),
    collectorPlan("kma_weather", resolvedMode, hasKma, "KMA weather"),
    collectorPlan("seoul_commercial_benchmark", resolvedMode, hasSeoul, "Seoul commercial district benchmark"),
    collectorPlan("seoul_foot_traffic_proxy", resolvedMode, hasSeoul, "Seoul living population/subway proxy"),
    collectorPlan("seoul_store_density_proxy", resolvedMode, hasSeoul, "Seoul store density proxy"),
  ];
  return {
    requested_mode: mode,
    resolved_mode: resolvedMode,
    live_keys_present: configuredKeys,
    safe_to_run_without_keys: true,
    collectors: collectorFilter ? plannedCollectors.filter((collector) => collectorFilter.includes(collector.collector_name)) : plannedCollectors,
  };
}

async function collectStorePublicContext({
  store,
  mode = "auto",
  env = process.env,
  credentials = {},
  fetchImpl = globalThis.fetch,
  storeLocation = null,
  latestRevenueDate = null,
  collectors = null,
} = {}) {
  const startedAt = Date.now();
  const globalBudgetMs = readPositiveInt(env.PUBLIC_CONTEXT_GLOBAL_BUDGET_MS, DEFAULT_TIMEOUTS.global_budget);
  const collectorFilter = normalizeCollectorFilter(collectors);
  const plan = planStorePublicContextCollection({ mode, env, credentials, collectors: collectorFilter });
  if (plan.resolved_mode === "seed") {
    const seedCollectors = plan.collectors.map((collector) => ({
      name: collector.collector_name,
      status: "skipped",
      source_name: collector.source,
      observation_count: 0,
      reason: "seed_mode_uses_deterministic_seed_writer",
      duration_ms: 0,
      freshness: null,
      collected_at: new Date().toISOString(),
    }));
    return {
      requested_mode: mode,
      resolved_mode: "seed",
      collectors: seedCollectors,
      observations: [],
      benchmarks: [],
      nearby_store_snapshots: [],
      commercial_area_mappings: [],
      store_location: null,
      seed_fallback_recommended: true,
      completed_collector_count: 0,
      skipped_collector_count: seedCollectors.length,
      failed_collector_count: 0,
      timed_out_collector_count: 0,
      total_duration_ms: Date.now() - startedAt,
      global_budget_ms: globalBudgetMs,
    };
  }

  const deadlineAt = startedAt + globalBudgetMs;
  const shouldRun = (name) => !collectorFilter || collectorFilter.includes(name);
  const results = [];
  const geocode = shouldRun("kakao_geocoding")
    ? await collectKakaoStoreLocation(store, credentials, {
      fetchImpl,
      timeoutMs: remainingTimeout(env.KAKAO_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.kakao_geocoding, deadlineAt),
    })
    : null;
  if (geocode) results.push(geocode);
  const locationForWeather = geocode?.store_location || storeLocation;
  const parallelCollectors = [
    shouldRun("kma_weather")
      ? collectKmaWeather(store, credentials, {
        fetchImpl,
        env,
        storeLocation: locationForWeather,
        latestRevenueDate,
        timeoutMs: remainingTimeout(env.KMA_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.kma_weather, deadlineAt),
      })
      : null,
    shouldRun("seoul_commercial_benchmark")
      ? collectSeoulCommercialBenchmark(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.SEOUL_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.seoul_commercial_benchmark, deadlineAt),
      })
      : null,
    shouldRun("seoul_foot_traffic_proxy")
      ? collectSeoulFootTrafficProxy(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.SEOUL_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.seoul_foot_traffic_proxy, deadlineAt),
      })
      : null,
    shouldRun("seoul_store_density_proxy")
      ? collectSeoulStoreDensityProxy(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.SEOUL_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.seoul_store_density_proxy, deadlineAt),
      })
      : null,
  ].filter(Boolean);

  results.push(...await Promise.all(parallelCollectors));
  for (const collector of results) {
    logCollectorStatus(store?.store_id, collector);
  }
  const completed = results.filter((collector) => collector.status === "completed");
  const failed = results.filter((collector) => collector.status === "failed");
  const skipped = results.filter((collector) => collector.status === "skipped");
  const timedOut = results.filter((collector) => collector.reason === "request_timeout");
  return {
    requested_mode: mode,
    resolved_mode: plan.resolved_mode,
    collectors: results.map(summarizeCollectorResult),
    observations: results.flatMap((collector) => collector.observations || []),
    benchmarks: results.flatMap((collector) => collector.benchmarks || []),
    nearby_store_snapshots: results.flatMap((collector) => collector.nearby_store_snapshots || []),
    commercial_area_mappings: results.flatMap((collector) => collector.commercial_area_mappings || []),
    store_location: geocode?.store_location || null,
    seed_fallback_recommended: mode === "auto" && completed.length === 0,
    completed_collector_count: completed.length,
    skipped_collector_count: skipped.length,
    failed_collector_count: failed.length,
    timed_out_collector_count: timedOut.length,
    total_duration_ms: Date.now() - startedAt,
    global_budget_ms: globalBudgetMs,
  };
}

async function collectKakaoStoreLocation(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.kakao_geocoding } = {}) {
  const name = "kakao_geocoding";
  const startedAt = Date.now();
  if (!credentials.kakaoRestApiKey) return withDuration(skipped(name, "Kakao Local API", "missing_key"), startedAt);
  if (!store?.address_text) return withDuration(skipped(name, "Kakao Local API", "missing_address_text"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, "Kakao Local API", "fetch_unavailable"), startedAt);

  const url = buildKakaoAddressSearchUrl(store.address_text);
  const sourceRef = `https://dapi.kakao.com/v2/local/search/address.json?query_hash=${hashText(store.address_text)}`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `KakaoAK ${credentials.kakaoRestApiKey}`,
      },
      fetchImpl,
    }, timeoutMs, { collector_name: name, source_ref: sourceRef });
    const body = await response.json();
    const document = Array.isArray(body?.documents) ? body.documents[0] : null;
    if (!document) return withDuration(skipped(name, "Kakao Local API", "no_result"), startedAt);

    const latitude = numberOrNull(document.y);
    const longitude = numberOrNull(document.x);
    const address = document.address || {};
    const roadAddress = document.road_address || {};
    const metadata = {
      latitude,
      longitude,
      address_name: document.address_name || null,
      road_address_name: roadAddress.address_name || null,
      region_1depth_name: address.region_1depth_name || roadAddress.region_1depth_name || null,
      region_2depth_name: address.region_2depth_name || roadAddress.region_2depth_name || null,
      region_3depth_name: address.region_3depth_name || roadAddress.region_3depth_name || null,
      not_proven_causality: true,
    };
    return withDuration(completed(name, "Kakao Local API", {
      observations: [{
        source_id: "kakao_local_api",
        source_name: "Kakao Local API",
        source_type: "geocoding",
        provider: "kakao",
        source_url: "https://developers.kakao.com/docs/latest/ko/local/dev-guide",
        context_type: "geocoding",
        metric_name: "store_location_resolved",
        metric_value: latitude && longitude ? 1 : 0,
        metric_unit: "resolved",
        label: "Kakao geocoding resolved store location. 인과가 확정된 것은 아닙니다.",
        region: store.region || metadata.region_2depth_name,
        source_ref: sourceRef,
        metadata,
      }],
      store_location: {
        address_text: store.address_text,
        latitude,
        longitude,
        region: store.region || metadata.region_2depth_name,
        administrative_dong: metadata.region_3depth_name,
        legal_dong: metadata.region_3depth_name,
        geocode_provider: "kakao",
        geocode_status: latitude && longitude ? "geocoded" : "failed",
        metadata,
      },
      commercial_area_mappings: metadata.region_3depth_name ? [{
        commercial_area_code: null,
        commercial_area_name: metadata.region_3depth_name,
        administrative_dong: metadata.region_3depth_name,
        business_category: store.business_category,
        mapping_method: "district_match",
        confidence: "medium",
        metadata: { source_name: "Kakao Local API", source_ref: sourceRef, not_proven_causality: true },
      }] : [],
      raw_summary: { document_count: Array.isArray(body?.documents) ? body.documents.length : 0 },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, "Kakao Local API", sanitizeErrorReason(error)), startedAt);
  }
}

async function collectKmaWeather(store, credentials = {}, {
  fetchImpl = globalThis.fetch,
  env = process.env,
  latestRevenueDate = null,
  timeoutMs = DEFAULT_TIMEOUTS.kma_weather,
} = {}) {
  const name = "kma_weather";
  const startedAt = Date.now();
  const serviceKey = credentials.kmaServiceKey || credentials.dataGoKrServiceKey;
  const endpoint = credentials.kmaNowcastEndpoint || credentials.kmaForecastEndpoint;
  const nx = credentials.kmaDefaultNx || env.KMA_DEFAULT_NX;
  const ny = credentials.kmaDefaultNy || env.KMA_DEFAULT_NY;
  if (!serviceKey) return withDuration(skipped(name, "KMA Weather API", "missing_key"), startedAt);
  if (!credentials.kmaApiBaseUrl && !endpoint) return withDuration(skipped(name, "KMA Weather API", "missing_endpoint"), startedAt);
  if (!endpoint) return withDuration(skipped(name, "KMA Weather API", "missing_endpoint"), startedAt);
  if (!endpoint.startsWith("http") && !credentials.kmaApiBaseUrl) return withDuration(skipped(name, "KMA Weather API", "missing_base_url"), startedAt);
  if (!nx || !ny) return withDuration(skipped(name, "KMA Weather API", "missing_kma_grid"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, "KMA Weather API", "fetch_unavailable"), startedAt);

  const baseDate = formatKmaDate(latestRevenueDate || new Date());
  const baseTime = env.KMA_BASE_TIME || "0500";
  const { url, sourceRef } = buildKmaRequestUrl({
    endpoint,
    baseUrl: credentials.kmaApiBaseUrl,
    serviceKey,
    baseDate,
    baseTime,
    nx,
    ny,
  });
  try {
    const response = await fetchWithTimeout(url, { fetchImpl }, timeoutMs, { collector_name: name, source_ref: sourceRef });
    const bodyText = await response.text();
    const parsed = parseKmaWeatherResponse(bodyText);
    if (parsed.length === 0) return withDuration(skipped(name, "KMA Weather API", "no_weather_items"), startedAt);
    const observations = normalizeWeatherObservations(parsed, {
      store,
      sourceRef,
      baseDate,
      baseTime,
      nx,
      ny,
    });
    return withDuration(completed(name, "KMA Weather API", {
      observations,
      raw_summary: { item_count: parsed.length, base_date: baseDate, base_time: baseTime },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, "KMA Weather API", sanitizeErrorReason(error)), startedAt);
  }
}

function buildKmaRequestUrl({ endpoint, serviceKey, baseDate, baseTime, nx, ny, baseUrl = "" }) {
  const base = endpoint.startsWith("http") ? endpoint : `${String(baseUrl || "").replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const url = new URL(base);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", url.searchParams.get("pageNo") || "1");
  url.searchParams.set("numOfRows", url.searchParams.get("numOfRows") || "1000");
  url.searchParams.set("dataType", url.searchParams.get("dataType") || "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  const sanitized = new URL(url.toString());
  sanitized.searchParams.set("serviceKey", "***");
  return { url: url.toString(), sourceRef: sanitized.toString() };
}

function parseKmaWeatherResponse(bodyText) {
  const trimmed = String(bodyText || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    const items = json?.response?.body?.items?.item || json?.items?.item || json?.item || [];
    return Array.isArray(items) ? items : [items];
  }
  const itemMatches = [...trimmed.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return itemMatches.map((match) => {
    const itemXml = match[1];
    return {
      category: xmlValue(itemXml, "category"),
      obsrValue: xmlValue(itemXml, "obsrValue"),
      fcstValue: xmlValue(itemXml, "fcstValue"),
      baseDate: xmlValue(itemXml, "baseDate"),
      baseTime: xmlValue(itemXml, "baseTime"),
      fcstDate: xmlValue(itemXml, "fcstDate"),
      fcstTime: xmlValue(itemXml, "fcstTime"),
    };
  });
}

function normalizeWeatherObservations(items, { store, sourceRef, baseDate, baseTime, nx, ny }) {
  const selected = new Map();
  for (const item of items) {
    const category = String(item.category || "").toUpperCase();
    const value = item.obsrValue ?? item.fcstValue;
    if (["RN1", "PCP", "T1H", "TMP", "PTY", "SKY"].includes(category) && !selected.has(category)) {
      selected.set(category, value);
    }
  }
  const rows = [];
  addWeatherObservation(rows, selected, ["RN1", "PCP"], {
    metric_name: "rainfall_mm",
    metric_unit: "mm",
    context_type: "weather",
    label: "KMA rainfall signal was observed together with revenue context. 인과가 확정된 것은 아닙니다.",
  });
  addWeatherObservation(rows, selected, ["T1H", "TMP"], {
    metric_name: "temperature_c",
    metric_unit: "celsius",
    context_type: "weather",
    label: "KMA temperature signal was observed together with revenue context. 인과가 확정된 것은 아닙니다.",
  });
  addWeatherObservation(rows, selected, ["PTY", "SKY"], {
    metric_name: "weather_condition_code",
    metric_unit: "code",
    context_type: "weather",
    label: "KMA weather condition code was observed together with revenue context. 인과가 확정된 것은 아닙니다.",
  });
  return rows.map((row) => ({
    ...row,
    source_id: "kma_weather_api",
    source_name: "KMA Weather API",
    source_type: "weather",
    provider: "kma_data_go_kr",
    source_url: "https://www.data.go.kr/",
    observation_date: kmaDateToIso(baseDate),
    region: store.region,
    source_ref: sourceRef,
    metadata: {
      base_date: baseDate,
      base_time: baseTime,
      nx: String(nx),
      ny: String(ny),
      not_proven_causality: true,
    },
  }));
}

async function fetchSeoulOpenDataDataset({ endpoint, key, startIndex = 1, endIndex = 5, params = {}, baseUrl = "https://openapi.seoul.go.kr:8088", fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.seoul_commercial_benchmark }) {
  const safeEndpoint = String(endpoint || "").replace(/^\/+|\/+$/g, "");
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}/json/${safeEndpoint}/${startIndex}/${endIndex}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && typeof value !== "undefined") url.searchParams.set(name, String(value));
  }
  const sourceRef = sanitizeSeoulUrl(url.toString(), key);
  const response = await fetchWithTimeout(url.toString(), { fetchImpl }, timeoutMs, {
    collector_name: "seoul_open_data",
    source_ref: sourceRef,
  });
  const body = await response.json();
  return {
    rows: extractSeoulRows(body),
    sourceRef,
  };
}

async function collectSeoulCommercialBenchmark(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.seoul_commercial_benchmark } = {}) {
  return collectSeoulDataset({
    name: "seoul_commercial_benchmark",
    sourceName: "Seoul Open Data commercial benchmark",
    endpoint: credentials.seoulCommercialSalesEndpoint,
    metricName: "commercial_area_sales_delta_pct",
    contextType: "benchmark",
    store,
    credentials,
    fetchImpl,
    timeoutMs,
    toPayload(row, sourceRef) {
      const salesAmount = firstNumber(row, ["SALES_AMOUNT", "THSMON_SELNG_AMT", "SELNG_AMT", "sales_amount"]);
      const transactionCount = firstNumber(row, ["TRANSACTION_COUNT", "THSMON_SELNG_CO", "SELNG_CO", "transaction_count"]);
      return {
        observations: [{
          metric_value: firstNumber(row, ["SALES_DELTA_PCT", "SELNG_DELTA_PCT", "CHANGE_RATE", "change_rate"]),
          metric_unit: "pct",
          label: "Seoul commercial benchmark signal was observed together with store revenue context. 인과가 확정된 것은 아닙니다.",
        }],
        benchmarks: [{
          source_id: "seoul_open_data_commercial_sales",
          source_name: "Seoul Open Data commercial benchmark",
          source_type: "benchmark",
          provider: "seoul_open_data",
          source_url: "https://data.seoul.go.kr/",
          source_ref: sourceRef,
          region: store.region,
          commercial_area_code: firstString(row, ["TRDAR_CD", "commercial_area_code"]),
          business_category: store.business_category,
          period_start: firstDate(row, ["PERIOD_START", "STDR_YYQU_CD", "YM"]),
          period_end: firstDate(row, ["PERIOD_END", "STDR_YYQU_CD", "YM"]),
          sales_amount: salesAmount,
          transaction_count: transactionCount,
          avg_transaction_value: salesAmount && transactionCount ? salesAmount / transactionCount : null,
          metadata: { row_keys: Object.keys(row).slice(0, 20), not_proven_causality: true },
        }],
      };
    },
  });
}

async function collectSeoulFootTrafficProxy(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.seoul_foot_traffic_proxy } = {}) {
  return collectSeoulDataset({
    name: "seoul_foot_traffic_proxy",
    sourceName: "Seoul Open Data foot traffic proxy",
    endpoint: credentials.seoulFootTrafficEndpoint,
    metricName: "foot_traffic_proxy_delta_pct",
    contextType: "foot_traffic",
    store,
    credentials,
    fetchImpl,
    timeoutMs,
    toPayload(row) {
      return {
        observations: [{
          metric_value: firstNumber(row, ["FOOT_TRAFFIC_DELTA_PCT", "LVPOP_DELTA_PCT", "CHANGE_RATE", "TOT_LVPOP_CO"]),
          metric_unit: "pct",
          label: "Seoul foot traffic proxy was observed together with revenue context. 인과가 확정된 것은 아닙니다.",
        }],
      };
    },
  });
}

async function collectSeoulStoreDensityProxy(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.seoul_store_density_proxy } = {}) {
  return collectSeoulDataset({
    name: "seoul_store_density_proxy",
    sourceName: "Seoul Open Data store density proxy",
    endpoint: credentials.seoulStoreDensityEndpoint,
    metricName: "same_category_store_count",
    contextType: "competition",
    store,
    credentials,
    fetchImpl,
    timeoutMs,
    toPayload(row, sourceRef) {
      const sameCategoryCount = firstNumber(row, ["SAME_CATEGORY_STORE_COUNT", "STOR_CO", "STORE_COUNT", "CMRCL_STORE_CO"]);
      return {
        observations: [{
          metric_value: sameCategoryCount,
          metric_unit: "stores",
          label: "Same-category store density was observed together with revenue context. 추가 확인이 필요합니다.",
        }],
        nearby_store_snapshots: [{
          snapshot_date: new Date().toISOString().slice(0, 10),
          radius_m: 500,
          business_category: store.business_category,
          same_category_store_count: sameCategoryCount,
          total_store_count: firstNumber(row, ["TOTAL_STORE_COUNT", "TOT_STOR_CO", "TOTAL_COUNT"]),
          source_id: "seoul_open_data_store_density",
          source_name: "Seoul Open Data store density proxy",
          source_type: "commercial_district",
          provider: "seoul_open_data",
          source_url: "https://data.seoul.go.kr/",
          source_ref: sourceRef,
          metadata: { row_keys: Object.keys(row).slice(0, 20), not_proven_causality: true },
        }],
      };
    },
  });
}

async function collectSeoulDataset({ name, sourceName, endpoint, metricName, contextType, store, credentials, fetchImpl, timeoutMs, toPayload }) {
  const startedAt = Date.now();
  if (!credentials.seoulOpenDataKey) return withDuration(skipped(name, sourceName, "missing_key"), startedAt);
  if (!endpoint) return withDuration(skipped(name, sourceName, "endpoint_not_configured"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, sourceName, "fetch_unavailable"), startedAt);

  try {
    const { rows, sourceRef } = await fetchSeoulOpenDataDataset({
      endpoint,
      key: credentials.seoulOpenDataKey,
      baseUrl: credentials.seoulOpenDataBaseUrl,
      timeoutMs,
      params: {
        region: store.region,
        category: store.business_category,
      },
      fetchImpl,
    });
    if (rows.length === 0) return withDuration(skipped(name, sourceName, "no_result"), startedAt);
    const payload = toPayload(rows[0], sourceRef) || {};
    return withDuration(completed(name, sourceName, {
      observations: (payload.observations || []).map((observation) => ({
        source_id: sourceIdForSeoulCollector(name),
        source_name: sourceName,
        source_type: contextType,
        provider: "seoul_open_data",
        source_url: "https://data.seoul.go.kr/",
        source_ref: sourceRef,
        context_type: contextType,
        metric_name: metricName,
        region: store.region,
        metadata: { not_proven_causality: true },
        ...observation,
      })),
      benchmarks: payload.benchmarks || [],
      nearby_store_snapshots: payload.nearby_store_snapshots || [],
      raw_summary: { row_count: rows.length },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, sourceName, sanitizeErrorReason(error)), startedAt);
  }
}

function completed(name, sourceName, payload = {}) {
  return {
    name,
    status: "completed",
    source_name: sourceName,
    observation_count: payload.observations?.length || 0,
    reason: null,
    freshness: new Date().toISOString(),
    collected_at: new Date().toISOString(),
    ...payload,
  };
}

function skipped(name, sourceName, reason) {
  return {
    name,
    status: "skipped",
    source_name: sourceName,
    observation_count: 0,
    reason,
    freshness: null,
    collected_at: new Date().toISOString(),
    observations: [],
    benchmarks: [],
    nearby_store_snapshots: [],
    commercial_area_mappings: [],
  };
}

function failed(name, sourceName, reason) {
  return {
    name,
    status: "failed",
    source_name: sourceName,
    observation_count: 0,
    reason,
    freshness: null,
    collected_at: new Date().toISOString(),
    observations: [],
    benchmarks: [],
    nearby_store_snapshots: [],
    commercial_area_mappings: [],
  };
}

function summarizeCollectorResult(result) {
  return {
    name: result.name,
    status: result.status,
    source_name: result.source_name,
    observation_count: result.observation_count || 0,
    reason: result.reason || null,
    duration_ms: result.duration_ms ?? null,
    freshness: result.freshness || null,
    collected_at: result.collected_at,
  };
}

function collectorPlan(name, mode, liveAvailable, source) {
  if (mode === "seed") return { collector_name: name, status: "seed_ready", source, live_available: liveAvailable };
  if (mode === "live" && !liveAvailable) return { collector_name: name, status: "skipped_missing_key", source, live_available: false };
  return { collector_name: name, status: "live_ready", source, live_available: true };
}

function buildKakaoAddressSearchUrl(addressText) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", addressText);
  return url.toString();
}

function addWeatherObservation(rows, selected, categories, base) {
  for (const category of categories) {
    if (selected.has(category)) {
      rows.push({ ...base, metric_value: numberOrNull(selected.get(category)) ?? null });
      return;
    }
  }
}

function extractSeoulRows(body) {
  if (!body || typeof body !== "object") return [];
  for (const value of Object.values(body)) {
    if (Array.isArray(value?.row)) return value.row;
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(body.row)) return body.row;
  return [];
}

function sourceIdForSeoulCollector(name) {
  if (name.includes("foot")) return "seoul_open_data_foot_traffic";
  if (name.includes("density")) return "seoul_open_data_store_density";
  return "seoul_open_data_commercial_sales";
}

function sanitizeSeoulUrl(url, key) {
  return String(url).replace(encodeURIComponent(key), "***").replace(key, "***");
}

function sanitizeErrorReason(error) {
  if (error?.reason) return error.reason;
  if (error?.name === "AbortError") return "request_timeout";
  const name = error?.name || "collector_error";
  const status = error?.status ? `_status_${error.status}` : "";
  return `${name}${status}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000, context = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    const error = new Error("fetch_unavailable");
    error.reason = "fetch_unavailable";
    throw error;
  }
  const controller = new AbortController();
  const timeout = readPositiveInt(timeoutMs, 5000);
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error("request_timeout");
      error.name = "AbortError";
      error.reason = "request_timeout";
      error.collector_name = context.collector_name;
      reject(error);
    }, timeout);
  });
  try {
    const { fetchImpl: _unused, ...fetchOptions } = options;
    const response = await Promise.race([
      fetchImpl(url, {
        ...fetchOptions,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
    if (!response?.ok) {
      const error = new Error(`http_${response?.status || "error"}`);
      error.reason = `http_${response?.status || "error"}`;
      error.status = response?.status;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function withDuration(result, startedAt) {
  return {
    ...result,
    duration_ms: Math.max(0, Date.now() - startedAt),
  };
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function remainingTimeout(configuredValue, defaultValue, deadlineAt) {
  const requested = readPositiveInt(configuredValue, defaultValue);
  const remaining = Math.max(1, deadlineAt - Date.now());
  return Math.min(requested, remaining);
}

function normalizeCollectorFilter(collectors) {
  if (collectors === null || typeof collectors === "undefined") return null;
  if (!Array.isArray(collectors)) {
    const error = new Error("collectors must be an array");
    error.code = "invalid_body";
    throw error;
  }
  const normalized = [...new Set(collectors.map((collector) => String(collector || "").trim()).filter(Boolean))];
  const unknown = normalized.filter((collector) => !COLLECTOR_NAMES.includes(collector));
  if (unknown.length > 0) {
    const error = new Error(`Unknown public context collector: ${unknown.join(", ")}`);
    error.code = "invalid_body";
    throw error;
  }
  return normalized.length > 0 ? normalized : null;
}

function logCollectorStatus(storeId, collector) {
  const payload = {
    route: "public_context_collect",
    store_id: storeId || null,
    collector_name: collector.name,
    status: collector.status,
    duration_ms: collector.duration_ms ?? null,
    reason: collector.reason || null,
  };
  console.info(JSON.stringify(payload));
}

function xmlValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXml(match[1]) : null;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = numberOrNull(row?.[key] ?? row?.[key.toLowerCase()]);
    if (value !== null) return value;
  }
  return null;
}

function firstString(row, keys) {
  for (const key of keys) {
    const value = row?.[key] ?? row?.[key.toLowerCase()];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstDate(row, keys) {
  const value = firstString(row, keys);
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (/^\d{6}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
  if (/^\d{4}$/.test(value)) return `${value.slice(0, 4)}-01-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function numberOrNull(value) {
  if (value === null || typeof value === "undefined") return null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (normalized === "" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKmaDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10).replace(/-/g, "");
  }
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10).replace(/-/g, "");
  if (/^\d{8}$/.test(text)) return text;
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function kmaDateToIso(value) {
  const text = String(value || "");
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return null;
}

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function hasAnyLiveCredential(credentials) {
  return Boolean(credentials?.kakaoRestApiKey || credentials?.seoulOpenDataKey || credentials?.kmaServiceKey || credentials?.dataGoKrServiceKey);
}

module.exports = {
  LIVE_KEY_NAMES,
  COLLECTOR_NAMES,
  DEFAULT_TIMEOUTS,
  getConfiguredContextKeys,
  planStorePublicContextCollection,
  normalizeCollectorFilter,
  fetchWithTimeout,
  collectStorePublicContext,
  geocodeStoreAddress: collectKakaoStoreLocation,
  collectKakaoStoreLocation,
  collectKmaWeather,
  buildKmaRequestUrl,
  parseKmaWeatherResponse,
  normalizeWeatherObservations,
  fetchSeoulOpenDataDataset,
  collectSeoulCommercialBenchmark,
  collectSeoulFootTrafficProxy,
  collectSeoulStoreDensityProxy,
};
