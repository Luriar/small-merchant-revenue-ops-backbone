const { createHash } = require("node:crypto");

const LIVE_KEY_NAMES = [
  "KMA_SERVICE_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "SEOUL_OPEN_DATA_KEY",
  "KAKAO_REST_API_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
];

function getConfiguredContextKeys(env = process.env) {
  return LIVE_KEY_NAMES.filter((name) => Boolean(env[name]));
}

function planStorePublicContextCollection({ mode = "auto", env = process.env, credentials = null } = {}) {
  const configuredKeys = getConfiguredContextKeys(env);
  const liveAvailable = configuredKeys.length > 0 || hasAnyLiveCredential(credentials);
  const hasKma = Boolean(env.KMA_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY || credentials?.kmaServiceKey);
  const hasSeoul = Boolean(env.SEOUL_OPEN_DATA_KEY || credentials?.seoulOpenDataKey);
  const hasKakao = Boolean(env.KAKAO_REST_API_KEY || credentials?.kakaoRestApiKey);
  const resolvedMode = mode === "auto" ? (liveAvailable ? "live" : "seed") : mode;
  return {
    requested_mode: mode,
    resolved_mode: resolvedMode,
    live_keys_present: configuredKeys,
    safe_to_run_without_keys: true,
    collectors: [
      collectorPlan("holiday", resolvedMode, true, "Korean holiday calendar"),
      collectorPlan("weather", resolvedMode, hasKma, "KMA weather"),
      collectorPlan("commercial_benchmark", resolvedMode, hasSeoul, "Seoul commercial district benchmark"),
      collectorPlan("geocoding", resolvedMode, hasKakao, "Kakao Local API"),
      collectorPlan("foot_traffic_proxy", resolvedMode, hasSeoul, "Seoul living population/subway proxy"),
      collectorPlan("nearby_store_density", resolvedMode, hasSeoul, "Seoul store density proxy"),
    ],
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
} = {}) {
  const plan = planStorePublicContextCollection({ mode, env, credentials });
  if (plan.resolved_mode === "seed") {
    return {
      requested_mode: mode,
      resolved_mode: "seed",
      collectors: plan.collectors.map((collector) => ({
        name: collector.collector_name,
        status: "skipped",
        source_name: collector.source,
        observation_count: 0,
        reason: "seed_mode_uses_deterministic_seed_writer",
        collected_at: new Date().toISOString(),
      })),
      observations: [],
      benchmarks: [],
      nearby_store_snapshots: [],
      commercial_area_mappings: [],
      store_location: null,
      seed_fallback_recommended: true,
    };
  }

  const geocode = await collectKakaoStoreLocation(store, credentials, { fetchImpl });
  const locationForWeather = geocode.store_location || storeLocation;
  const weather = await collectKmaWeather(store, credentials, {
    fetchImpl,
    env,
    storeLocation: locationForWeather,
    latestRevenueDate,
  });
  const commercial = await collectSeoulCommercialBenchmark(store, credentials, { fetchImpl });
  const footTraffic = await collectSeoulFootTrafficProxy(store, credentials, { fetchImpl });
  const density = await collectSeoulStoreDensityProxy(store, credentials, { fetchImpl });

  const collectors = [geocode, weather, commercial, footTraffic, density];
  const completed = collectors.filter((collector) => collector.status === "completed");
  const failed = collectors.filter((collector) => collector.status === "failed");
  const skipped = collectors.filter((collector) => collector.status === "skipped");
  return {
    requested_mode: mode,
    resolved_mode: plan.resolved_mode,
    collectors: collectors.map(summarizeCollectorResult),
    observations: collectors.flatMap((collector) => collector.observations || []),
    benchmarks: collectors.flatMap((collector) => collector.benchmarks || []),
    nearby_store_snapshots: collectors.flatMap((collector) => collector.nearby_store_snapshots || []),
    commercial_area_mappings: collectors.flatMap((collector) => collector.commercial_area_mappings || []),
    store_location: geocode.store_location || null,
    seed_fallback_recommended: mode === "auto" && completed.length === 0,
    completed_collector_count: completed.length,
    skipped_collector_count: skipped.length,
    failed_collector_count: failed.length,
  };
}

async function collectKakaoStoreLocation(store, credentials = {}, { fetchImpl = globalThis.fetch } = {}) {
  const name = "kakao_geocoding";
  if (!credentials.kakaoRestApiKey) return skipped(name, "Kakao Local API", "missing_key");
  if (!store?.address_text) return skipped(name, "Kakao Local API", "missing_address_text");
  if (typeof fetchImpl !== "function") return skipped(name, "Kakao Local API", "fetch_unavailable");

  const url = buildKakaoAddressSearchUrl(store.address_text);
  const sourceRef = `https://dapi.kakao.com/v2/local/search/address.json?query_hash=${hashText(store.address_text)}`;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `KakaoAK ${credentials.kakaoRestApiKey}`,
      },
    });
    if (!response.ok) return failed(name, "Kakao Local API", `http_${response.status}`);
    const body = await response.json();
    const document = Array.isArray(body?.documents) ? body.documents[0] : null;
    if (!document) return skipped(name, "Kakao Local API", "no_result");

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
    return completed(name, "Kakao Local API", {
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
    });
  } catch (error) {
    return failed(name, "Kakao Local API", sanitizeErrorReason(error));
  }
}

async function collectKmaWeather(store, credentials = {}, {
  fetchImpl = globalThis.fetch,
  env = process.env,
  latestRevenueDate = null,
} = {}) {
  const name = "kma_weather";
  const serviceKey = credentials.kmaServiceKey || credentials.dataGoKrServiceKey;
  const endpoint = credentials.kmaNowcastEndpoint || credentials.kmaForecastEndpoint;
  const nx = credentials.kmaDefaultNx || env.KMA_DEFAULT_NX;
  const ny = credentials.kmaDefaultNy || env.KMA_DEFAULT_NY;
  if (!serviceKey) return skipped(name, "KMA Weather API", "missing_key");
  if (!credentials.kmaApiBaseUrl && !endpoint) return skipped(name, "KMA Weather API", "missing_endpoint");
  if (!endpoint) return skipped(name, "KMA Weather API", "missing_endpoint");
  if (!endpoint.startsWith("http") && !credentials.kmaApiBaseUrl) return skipped(name, "KMA Weather API", "missing_base_url");
  if (!nx || !ny) return skipped(name, "KMA Weather API", "missing_kma_grid");
  if (typeof fetchImpl !== "function") return skipped(name, "KMA Weather API", "fetch_unavailable");

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
    const response = await fetchImpl(url);
    if (!response.ok) return failed(name, "KMA Weather API", `http_${response.status}`);
    const bodyText = await response.text();
    const parsed = parseKmaWeatherResponse(bodyText);
    if (parsed.length === 0) return skipped(name, "KMA Weather API", "no_weather_items");
    const observations = normalizeWeatherObservations(parsed, {
      store,
      sourceRef,
      baseDate,
      baseTime,
      nx,
      ny,
    });
    return completed(name, "KMA Weather API", {
      observations,
      raw_summary: { item_count: parsed.length, base_date: baseDate, base_time: baseTime },
    });
  } catch (error) {
    return failed(name, "KMA Weather API", sanitizeErrorReason(error));
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

async function fetchSeoulOpenDataDataset({ endpoint, key, startIndex = 1, endIndex = 5, params = {}, baseUrl = "https://openapi.seoul.go.kr:8088", fetchImpl = globalThis.fetch }) {
  const safeEndpoint = String(endpoint || "").replace(/^\/+|\/+$/g, "");
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}/json/${safeEndpoint}/${startIndex}/${endIndex}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && typeof value !== "undefined") url.searchParams.set(name, String(value));
  }
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    const error = new Error(`seoul_open_data_http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  return {
    rows: extractSeoulRows(body),
    sourceRef: sanitizeSeoulUrl(url.toString(), key),
  };
}

async function collectSeoulCommercialBenchmark(store, credentials = {}, { fetchImpl = globalThis.fetch } = {}) {
  return collectSeoulDataset({
    name: "seoul_commercial_benchmark",
    sourceName: "Seoul Open Data commercial benchmark",
    endpoint: credentials.seoulCommercialSalesEndpoint,
    metricName: "commercial_area_sales_delta_pct",
    contextType: "benchmark",
    store,
    credentials,
    fetchImpl,
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

async function collectSeoulFootTrafficProxy(store, credentials = {}, { fetchImpl = globalThis.fetch } = {}) {
  return collectSeoulDataset({
    name: "seoul_foot_traffic_proxy",
    sourceName: "Seoul Open Data foot traffic proxy",
    endpoint: credentials.seoulFootTrafficEndpoint,
    metricName: "foot_traffic_proxy_delta_pct",
    contextType: "foot_traffic",
    store,
    credentials,
    fetchImpl,
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

async function collectSeoulStoreDensityProxy(store, credentials = {}, { fetchImpl = globalThis.fetch } = {}) {
  return collectSeoulDataset({
    name: "seoul_store_density_proxy",
    sourceName: "Seoul Open Data store density proxy",
    endpoint: credentials.seoulStoreDensityEndpoint,
    metricName: "same_category_store_count",
    contextType: "competition",
    store,
    credentials,
    fetchImpl,
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

async function collectSeoulDataset({ name, sourceName, endpoint, metricName, contextType, store, credentials, fetchImpl, toPayload }) {
  if (!credentials.seoulOpenDataKey) return skipped(name, sourceName, "missing_key");
  if (!endpoint) return skipped(name, sourceName, "endpoint_not_configured");
  if (typeof fetchImpl !== "function") return skipped(name, sourceName, "fetch_unavailable");

  try {
    const { rows, sourceRef } = await fetchSeoulOpenDataDataset({
      endpoint,
      key: credentials.seoulOpenDataKey,
      baseUrl: credentials.seoulOpenDataBaseUrl,
      params: {
        region: store.region,
        category: store.business_category,
      },
      fetchImpl,
    });
    if (rows.length === 0) return skipped(name, sourceName, "no_result");
    const payload = toPayload(rows[0], sourceRef) || {};
    return completed(name, sourceName, {
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
    });
  } catch (error) {
    return failed(name, sourceName, sanitizeErrorReason(error));
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
  const name = error?.name || "collector_error";
  const status = error?.status ? `_status_${error.status}` : "";
  return `${name}${status}`;
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
  getConfiguredContextKeys,
  planStorePublicContextCollection,
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
