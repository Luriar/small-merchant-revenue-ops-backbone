const { createHash } = require("node:crypto");
const { TossPlaceClient } = require("./connectors/toss-place-client");
const { DeliveryProviderClient } = require("./connectors/delivery-provider-client");

const LIVE_KEY_NAMES = [
  "KMA_SERVICE_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "SEOUL_OPEN_DATA_KEY",
  "KAKAO_REST_API_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "NAVER_SEARCH_TREND_CLIENT_ID",
  "NAVER_SEARCH_TREND_CLIENT_SECRET",
  "HOLIDAY_SERVICE_KEY",
];

const COLLECTOR_NAMES = [
  "kakao_geocoding",
  "kma_weather",
  "seoul_commercial_benchmark",
  "seoul_foot_traffic_proxy",
  "seoul_store_density_proxy",
  "naver_local_competitor_search",
  "naver_search_trend",
  "korean_holiday_calendar",
  "toss_place_connector_smoke",
  "delivery_provider_connector_smoke",
];

const CONTEXT_COLLECTION_REASONS = [
  "store_onboarding_bootstrap",
  "manual_refresh",
  "scheduled_refresh",
];

const DEFAULT_TIMEOUTS = {
  kakao_geocoding: 4000,
  kma_weather: 5000,
  seoul_commercial_benchmark: 5000,
  seoul_foot_traffic_proxy: 5000,
  seoul_store_density_proxy: 5000,
  naver_local_competitor_search: 5000,
  naver_search_trend: 5000,
  korean_holiday_calendar: 5000,
  toss_place_connector_smoke: 5000,
  delivery_provider_connector_smoke: 5000,
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
  const hasNaverLocal = Boolean(
    (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET)
    || (credentials?.naverClientId && credentials?.naverClientSecret),
  );
  const hasNaverTrend = Boolean(
    ((env.NAVER_SEARCH_TREND_CLIENT_ID || env.NAVER_CLIENT_ID) && (env.NAVER_SEARCH_TREND_CLIENT_SECRET || env.NAVER_CLIENT_SECRET))
    || (credentials?.naverSearchTrendClientId && credentials?.naverSearchTrendClientSecret)
    || (credentials?.naverClientId && credentials?.naverClientSecret),
  );
  const hasHoliday = Boolean(env.HOLIDAY_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY || env.KMA_SERVICE_KEY || credentials?.holidayServiceKey || credentials?.dataGoKrServiceKey || credentials?.kmaServiceKey);
  const hasTossPlace = Boolean(credentials?.tossPlace?.configured || env.TOSS_PLACE_API_BASE_URL || env.TOSS_PLACE_SECRET_ID || env.TOSS_PLACE_SECRET_PATH);
  const hasDeliveryProvider = Boolean(credentials?.deliveryProvider?.configured || env.DELIVERY_PROVIDER_KIND || env.DELIVERY_PROVIDER_SECRET_ID || env.DELIVERY_PROVIDER_SECRET_PATH);
  const resolvedMode = mode === "auto" ? (liveAvailable ? "live" : "seed") : mode;
  const plannedCollectors = [
    collectorPlan("kakao_geocoding", resolvedMode, hasKakao, "Kakao Local API"),
    collectorPlan("kma_weather", resolvedMode, hasKma, "KMA weather"),
    collectorPlan("seoul_commercial_benchmark", resolvedMode, hasSeoul, "Seoul commercial district benchmark"),
    collectorPlan("seoul_foot_traffic_proxy", resolvedMode, hasSeoul, "Seoul living population/subway proxy"),
    collectorPlan("seoul_store_density_proxy", resolvedMode, hasSeoul, "Seoul store density proxy"),
    collectorPlan("naver_local_competitor_search", resolvedMode, hasNaverLocal, "Naver Local Search"),
    collectorPlan("naver_search_trend", resolvedMode, hasNaverTrend, "Naver DataLab"),
    collectorPlan("korean_holiday_calendar", resolvedMode, hasHoliday, "Korean Astronomy Holiday API"),
    connectorPlan("toss_place_connector_smoke", resolvedMode, hasTossPlace, "Toss Place connector smoke"),
    connectorPlan("delivery_provider_connector_smoke", resolvedMode, hasDeliveryProvider, "Delivery provider connector smoke"),
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
  reason = "manual_refresh",
  env = process.env,
  credentials = {},
  fetchImpl = globalThis.fetch,
  storeLocation = null,
  latestRevenueDate = null,
  collectors = null,
} = {}) {
  const startedAt = Date.now();
  const collectionReason = normalizeContextCollectionReason(reason);
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
      collection_reason: collectionReason,
      duration_ms: 0,
      freshness: null,
      collected_at: new Date().toISOString(),
    }));
    return {
      requested_mode: mode,
      collection_reason: collectionReason,
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
    shouldRun("naver_local_competitor_search")
      ? collectNaverLocalCompetitorSearch(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.NAVER_LOCAL_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.naver_local_competitor_search, deadlineAt),
      })
      : null,
    shouldRun("naver_search_trend")
      ? collectNaverSearchTrend(store, credentials, {
        fetchImpl,
        env,
        latestRevenueDate,
        timeoutMs: remainingTimeout(env.NAVER_TREND_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.naver_search_trend, deadlineAt),
      })
      : null,
    shouldRun("korean_holiday_calendar")
      ? collectKoreanHolidayCalendar(store, credentials, {
        fetchImpl,
        env,
        latestRevenueDate,
        timeoutMs: remainingTimeout(env.HOLIDAY_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.korean_holiday_calendar, deadlineAt),
      })
      : null,
    shouldRun("toss_place_connector_smoke")
      ? collectTossPlaceConnectorSmoke(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.TOSS_PLACE_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.toss_place_connector_smoke, deadlineAt),
      })
      : null,
    shouldRun("delivery_provider_connector_smoke")
      ? collectDeliveryProviderConnectorSmoke(store, credentials, {
        fetchImpl,
        timeoutMs: remainingTimeout(env.DELIVERY_PROVIDER_COLLECTOR_TIMEOUT_MS, DEFAULT_TIMEOUTS.delivery_provider_connector_smoke, deadlineAt),
      })
      : null,
  ].filter(Boolean);

  results.push(...await Promise.all(parallelCollectors));
  for (const collector of results) {
    collector.collection_reason = collectionReason;
  }
  for (const collector of results) {
    logCollectorStatus(store?.store_id, collector);
  }
  const completed = results.filter((collector) => collector.status === "completed");
  const failed = results.filter((collector) => collector.status === "failed");
  const skipped = results.filter((collector) => collector.status === "skipped");
  const timedOut = results.filter((collector) => collector.reason === "request_timeout");
  return {
    requested_mode: mode,
    collection_reason: collectionReason,
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
  now = new Date(),
} = {}) {
  const name = "kma_weather";
  const sourceName = "KMA Weather API";
  const startedAt = Date.now();
  const serviceKey = credentials.kmaServiceKey || credentials.dataGoKrServiceKey;
  const nx = credentials.kmaDefaultNx || env.KMA_DEFAULT_NX;
  const ny = credentials.kmaDefaultNy || env.KMA_DEFAULT_NY;

  if (!serviceKey) return withDuration(skipped(name, sourceName, "missing_key"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, sourceName, "fetch_unavailable"), startedAt);

  const endpointPlan = buildKmaEndpointPlan(credentials);
  if (endpointPlan.length === 0) return withDuration(skipped(name, sourceName, "missing_endpoint"), startedAt);
  const missingBaseUrl = endpointPlan.find((entry) => !entry.url.startsWith("http") && !credentials.kmaApiBaseUrl);
  if (missingBaseUrl) return withDuration(skipped(name, sourceName, "missing_base_url"), startedAt);

  if (!nx || !ny) {
    return withDuration({
      ...skipped(name, sourceName, "missing_kma_grid"),
      metadata: {
        attempted_endpoints: endpointPlan.map((entry) => entry.label),
        attempted_base_times: [],
        selected_endpoint: null,
        selected_base_date: null,
        selected_base_time: null,
        nx: null,
        ny: null,
        item_count: 0,
        result_code: null,
        result_msg: null,
      },
    }, startedAt);
  }

  const attempted = [];
  const attemptedEndpointLabels = [];
  let lastResultCode = null;
  let lastResultMsg = null;
  let lastErrorReason = null;
  const overrideBaseTime = readKmaBaseTimeOverride(env.KMA_BASE_TIME);
  const overrideBaseDate = readKmaBaseDateOverride(env.KMA_BASE_DATE);

  for (const endpoint of endpointPlan) {
    if (!attemptedEndpointLabels.includes(endpoint.label)) attemptedEndpointLabels.push(endpoint.label);

    const baseCandidates = (overrideBaseTime && overrideBaseDate)
      ? [{ baseDate: overrideBaseDate, baseTime: overrideBaseTime, source: "env_override" }]
      : generateKmaBaseTimeCandidates(endpoint.kind, now, { latestRevenueDate, overrideBaseTime, overrideBaseDate });

    for (const candidate of baseCandidates) {
      const { url, sourceRef } = buildKmaRequestUrl({
        endpoint: endpoint.url,
        baseUrl: credentials.kmaApiBaseUrl,
        serviceKey,
        baseDate: candidate.baseDate,
        baseTime: candidate.baseTime,
        nx,
        ny,
      });
      const attemptRecord = {
        endpoint: endpoint.label,
        base_date: candidate.baseDate,
        base_time: candidate.baseTime,
      };
      attempted.push(attemptRecord);

      let response;
      try {
        response = await fetchWithTimeout(url, { fetchImpl }, timeoutMs, {
          collector_name: name,
          source_ref: sourceRef,
        });
      } catch (error) {
        const reason = sanitizeErrorReason(error);
        attemptRecord.error = reason;
        // Hard timeout: stop the whole collector — we exhausted our budget.
        if (reason === "request_timeout") {
          return withDuration({
            ...failed(name, sourceName, "request_timeout"),
            metadata: buildKmaDebugMetadata({
              attempted, attemptedEndpointLabels,
              selectedEndpoint: null, selectedBaseDate: null, selectedBaseTime: null,
              nx, ny, itemCount: 0, resultCode: lastResultCode, resultMsg: lastResultMsg,
              lastErrorReason: reason,
            }),
          }, startedAt);
        }
        lastErrorReason = reason;
        continue; // try next candidate / endpoint
      }

      const bodyText = await response.text();
      const envelope = parseKmaWeatherEnvelope(bodyText);
      attemptRecord.result_code = envelope.resultCode || null;
      attemptRecord.item_count = envelope.items.length;
      lastResultCode = envelope.resultCode || lastResultCode;
      lastResultMsg = envelope.resultMsg || lastResultMsg;

      // Auth/key error → classify as failed and stop. Do NOT keep retrying with the same key.
      if (envelope.authError) {
        const authReason = envelope.resultCode
          ? `service_result_${envelope.resultCode}`
          : "service_key_invalid";
        return withDuration({
          ...failed(name, sourceName, authReason),
          metadata: buildKmaDebugMetadata({
            attempted, attemptedEndpointLabels,
            selectedEndpoint: null, selectedBaseDate: null, selectedBaseTime: null,
            nx, ny, itemCount: 0, resultCode: envelope.resultCode, resultMsg: envelope.resultMsg,
            lastErrorReason: null,
          }),
        }, startedAt);
      }

      // Other non-OK service codes: treat as transient and try next candidate.
      if (envelope.resultCode && envelope.resultCode !== "00" && envelope.items.length === 0) {
        attemptRecord.skipped_reason = `service_result_${envelope.resultCode}`;
        continue;
      }

      if (envelope.items.length === 0) continue; // empty items → try next candidate

      const observations = normalizeWeatherObservations(envelope.items, {
        store,
        sourceRef,
        baseDate: candidate.baseDate,
        baseTime: candidate.baseTime,
        nx,
        ny,
      });
      if (observations.length === 0) {
        // Items returned but none were of usable categories — try next candidate.
        attemptRecord.skipped_reason = "no_usable_categories";
        continue;
      }

      return withDuration(completed(name, sourceName, {
        observations,
        raw_summary: {
          item_count: envelope.items.length,
          base_date: candidate.baseDate,
          base_time: candidate.baseTime,
          endpoint: endpoint.label,
        },
        metadata: buildKmaDebugMetadata({
          attempted, attemptedEndpointLabels,
          selectedEndpoint: endpoint.label,
          selectedBaseDate: candidate.baseDate,
          selectedBaseTime: candidate.baseTime,
          nx, ny, itemCount: envelope.items.length,
          resultCode: envelope.resultCode, resultMsg: envelope.resultMsg,
          lastErrorReason: null,
        }),
      }), startedAt);
    }
  }

  // All candidates exhausted with no usable items.
  return withDuration({
    ...skipped(name, sourceName, "no_weather_items"),
    metadata: buildKmaDebugMetadata({
      attempted, attemptedEndpointLabels,
      selectedEndpoint: null, selectedBaseDate: null, selectedBaseTime: null,
      nx, ny, itemCount: 0, resultCode: lastResultCode, resultMsg: lastResultMsg,
      lastErrorReason,
    }),
  }, startedAt);
}

function buildKmaDebugMetadata({
  attempted, attemptedEndpointLabels,
  selectedEndpoint, selectedBaseDate, selectedBaseTime,
  nx, ny, itemCount, resultCode, resultMsg, lastErrorReason,
}) {
  return {
    attempted_endpoints: [...attemptedEndpointLabels],
    attempted_base_times: attempted.map((entry) => `${entry.endpoint}:${entry.base_date}:${entry.base_time}`),
    attempts: attempted.map((entry) => ({ ...entry })),
    selected_endpoint: selectedEndpoint,
    selected_base_date: selectedBaseDate,
    selected_base_time: selectedBaseTime,
    nx: nx != null ? String(nx) : null,
    ny: ny != null ? String(ny) : null,
    item_count: itemCount,
    result_code: resultCode || null,
    result_msg: resultMsg || null,
    last_error_reason: lastErrorReason || null,
  };
}

function buildKmaEndpointPlan(credentials = {}) {
  const seen = new Set();
  const plan = [];
  const add = (rawUrl, hint) => {
    if (!rawUrl) return;
    const url = String(rawUrl).trim();
    if (!url) return;
    const key = `${url}|${hint}`;
    if (seen.has(key)) return;
    seen.add(key);
    const kind = detectKmaEndpointKind(url, hint);
    plan.push({ url, kind, label: kind });
  };
  // Try ultra-short series first (more frequent updates), then village forecast.
  add(credentials.kmaNowcastEndpoint, "nowcast");
  add(credentials.kmaForecastEndpoint, "forecast");
  return plan;
}

function detectKmaEndpointKind(url, hint = "nowcast") {
  const lower = String(url || "").toLowerCase();
  if (lower.includes("ultrasrtncst") || lower.includes("ultrashortncst")) return "ultra_short_observation";
  if (lower.includes("ultrasrtfcst") || lower.includes("ultrashortfcst")) return "ultra_short_forecast";
  if (lower.includes("vilagefcst") || lower.includes("villagefcst") || lower.includes("/vilage") || lower.includes("/village")) return "village_forecast";
  return hint === "forecast" ? "village_forecast" : "ultra_short_observation";
}

const KMA_VILLAGE_BASE_TIMES_HHMM = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];
const KMA_VILLAGE_PUBLISH_DELAY_MIN = 10;
const KMA_ULTRA_SHORT_OBSERVATION_DELAY_MIN = 40;
const KMA_ULTRA_SHORT_FORECAST_DELAY_MIN = 45;

function generateKmaBaseTimeCandidates(kind, now = new Date(), opts = {}) {
  const candidatesByKind = {
    village_forecast: () => generateVillageForecastCandidates(now),
    ultra_short_observation: () => generateUltraShortObservationCandidates(now),
    ultra_short_forecast: () => generateUltraShortForecastCandidates(now),
  };
  const builder = candidatesByKind[kind] || candidatesByKind.ultra_short_observation;
  let candidates = builder();
  // Optional env override of base time (and optional latestRevenueDate-derived base date) — prepend as preferred candidate.
  if (opts.overrideBaseTime) {
    const baseDateOverride = opts.overrideBaseDate || formatKmaDate(opts.latestRevenueDate || now);
    candidates = [{ baseDate: baseDateOverride, baseTime: opts.overrideBaseTime, source: "env_override" }, ...candidates];
  }
  return dedupeCandidates(candidates).slice(0, 5);
}

function generateVillageForecastCandidates(now) {
  const candidates = [];
  // Walk back through hourly slots; only take the village-publishing base times that are at least 10 min in the past.
  for (let offset = 0; offset < 24 && candidates.length < 4; offset += 1) {
    const moment = shiftKstMinutes(now, -offset * 60 - KMA_VILLAGE_PUBLISH_DELAY_MIN);
    const parts = kstParts(moment);
    const hhmm = `${pad2Number(parts.hour)}00`;
    if (KMA_VILLAGE_BASE_TIMES_HHMM.includes(hhmm)) {
      candidates.push({
        baseDate: kstDateString(parts),
        baseTime: hhmm,
        source: "village_forecast",
      });
    }
  }
  // Fallback: last published village base time of yesterday.
  if (candidates.length === 0) {
    const yesterday = kstParts(shiftKstMinutes(now, -24 * 60));
    candidates.push({
      baseDate: kstDateString(yesterday),
      baseTime: "2300",
      source: "village_forecast_fallback",
    });
  }
  return candidates;
}

function generateUltraShortObservationCandidates(now) {
  const candidates = [];
  // Hourly HH:00 base times, available ~40 min after the hour.
  for (let offset = 0; offset < 5; offset += 1) {
    const moment = shiftKstMinutes(now, -KMA_ULTRA_SHORT_OBSERVATION_DELAY_MIN - offset * 60);
    const parts = kstParts(moment);
    candidates.push({
      baseDate: kstDateString(parts),
      baseTime: `${pad2Number(parts.hour)}00`,
      source: "ultra_short_observation",
    });
  }
  return candidates;
}

function generateUltraShortForecastCandidates(now) {
  const candidates = [];
  // Base times at HH:30 in KST, available ~45 min after the base time (i.e., HH+1:15).
  for (let offset = 0; offset < 5; offset += 1) {
    // Anchor moment: pretend "now" is 45 min earlier and snap down to the previous HH:30.
    const moment = shiftKstMinutes(now, -KMA_ULTRA_SHORT_FORECAST_DELAY_MIN - offset * 60);
    const parts = kstParts(moment);
    let baseHour = parts.hour;
    // Snap down to the most recent HH:30 in the past relative to `moment`.
    let baseDate = kstDateString(parts);
    if (parts.minute < 30) {
      // The HH:30 of the same hour is in the future — use previous hour's HH:30.
      baseHour -= 1;
      if (baseHour < 0) {
        const yesterday = kstParts(shiftKstMinutes(moment, -60));
        baseDate = kstDateString(yesterday);
        baseHour = 23;
      }
    }
    candidates.push({
      baseDate,
      baseTime: `${pad2Number(baseHour)}30`,
      source: "ultra_short_forecast",
    });
  }
  return candidates;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = `${candidate.baseDate}:${candidate.baseTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function readKmaBaseTimeOverride(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

function readKmaBaseDateOverride(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, "");
  return null;
}

function kstParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime() + 9 * 60 * 60 * 1000; // shift UTC → KST
  const shifted = new Date(ms);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    raw: shifted,
  };
}

function shiftKstMinutes(reference, deltaMinutes) {
  const date = reference instanceof Date ? reference : new Date(reference);
  return new Date(date.getTime() + deltaMinutes * 60 * 1000);
}

function kstDateString(parts) {
  return `${parts.year}${pad2Number(parts.month)}${pad2Number(parts.day)}`;
}

function pad2Number(value) {
  return String(value).padStart(2, "0");
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

// Backward-compatible: returns just the items array.
function parseKmaWeatherResponse(bodyText) {
  return parseKmaWeatherEnvelope(bodyText).items;
}

// Returns { items, resultCode, resultMsg, authError } for collector use.
function parseKmaWeatherEnvelope(bodyText) {
  const trimmed = String(bodyText || "").trim();
  if (!trimmed) return { items: [], resultCode: null, resultMsg: null, authError: false };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return { items: [], resultCode: null, resultMsg: null, authError: false };
    }
    const header = json?.response?.header || json?.header || null;
    const resultCode = header?.resultCode != null ? String(header.resultCode).trim() : null;
    const resultMsg = header?.resultMsg != null ? String(header.resultMsg).trim() : null;
    const authError = isKmaAuthErrorCode(resultCode) || isKmaAuthErrorMessage(resultMsg);
    const itemRoot = json?.response?.body?.items?.item ?? json?.items?.item ?? json?.item ?? [];
    const items = normalizeArray(itemRoot);
    return { items, resultCode, resultMsg, authError };
  }

  // XML/HTML/plain text path.
  const headerCode = xmlValue(trimmed, "resultCode") || xmlValue(trimmed, "returnReasonCode");
  const headerMsg = xmlValue(trimmed, "resultMsg") || xmlValue(trimmed, "returnAuthMsg") || xmlValue(trimmed, "errMsg");
  const itemMatches = [...trimmed.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const items = itemMatches.map((match) => {
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
  const authError = isKmaAuthErrorCode(headerCode) || isKmaAuthErrorMessage(headerMsg);
  return {
    items,
    resultCode: headerCode || null,
    resultMsg: headerMsg || null,
    authError,
  };
}

function isKmaAuthErrorCode(code) {
  if (!code) return false;
  const normalized = String(code).trim();
  // data.go.kr / KMA auth-related result codes:
  //   30 SERVICE KEY IS NOT REGISTERED
  //   31 DEADLINE HAS EXPIRED
  //   32 UNREGISTERED IP
  //   33 UNREGISTERED HTTP REFERRER (or similar)
  return ["30", "31", "32", "33"].includes(normalized);
}

function isKmaAuthErrorMessage(message) {
  if (!message) return false;
  const text = String(message);
  if (/SERVICE\s*KEY/i.test(text) && /(NOT\s*REGISTERED|INVALID|UNAUTHORIZED|EXPIRED)/i.test(text)) return true;
  if (/UNREGISTERED\s+IP/i.test(text)) return true;
  if (/AUTH/i.test(text) && /FAIL|ERROR|INVALID/i.test(text)) return true;
  return false;
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

async function fetchSeoulOpenDataDataset({ endpoint, key, startIndex = 1, endIndex = 5, params = {}, baseUrl = "http://openapi.seoul.go.kr:8088", fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.seoul_commercial_benchmark }) {
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

async function collectNaverLocalCompetitorSearch(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.naver_local_competitor_search } = {}) {
  const name = "naver_local_competitor_search";
  const startedAt = Date.now();
  if (!credentials.naverClientId || !credentials.naverClientSecret) return withDuration(skipped(name, "Naver Local Search", "missing_key"), startedAt);
  const query = buildNaverLocalQuery(store);
  if (!query) return withDuration(skipped(name, "Naver Local Search", "missing_query_context"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, "Naver Local Search", "fetch_unavailable"), startedAt);

  const endpoint = credentials.naverLocalSearchEndpoint || "https://openapi.naver.com/v1/search/local.json";
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  const sourceRef = `naver_local_search:query_hash:${hashText(query)}:display_5`;

  try {
    const response = await fetchWithTimeout(url.toString(), {
      fetchImpl,
      headers: {
        "X-Naver-Client-Id": credentials.naverClientId,
        "X-Naver-Client-Secret": credentials.naverClientSecret,
      },
    }, timeoutMs, { collector_name: name, source_ref: sourceRef });
    const body = await response.json();
    const items = normalizeArray(body?.items).map(normalizeNaverLocalItem);
    return withDuration(completed(name, "Naver Local Search", {
      observations: [{
        source_id: "naver_local_search",
        source_name: "Naver Local Search",
        source_type: "nearby_competitor_search",
        provider: "naver",
        source_url: "https://developers.naver.com/docs/serviceapi/search/local/local.md",
        source_ref: sourceRef,
        context_type: "nearby_competitor_search",
        metric_name: "nearby_same_category_result_count",
        metric_value: items.length,
        metric_unit: "results",
        label: "Naver Local Search에서 같은 지역·업종 점포 후보가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
        region: store.region,
        metadata: {
          query_hash: hashText(query),
          result_count: items.length,
          normalized_items: items.slice(0, 5),
          not_proven_causality: true,
        },
      }],
      nearby_store_snapshots: [{
        snapshot_date: new Date().toISOString().slice(0, 10),
        radius_m: 500,
        business_category: store.business_category,
        same_category_store_count: items.length,
        total_store_count: items.length,
        source_id: "naver_local_search",
        source_name: "Naver Local Search",
        source_type: "nearby_competitor_search",
        provider: "naver",
        source_url: "https://developers.naver.com/docs/serviceapi/search/local/local.md",
        source_ref: sourceRef,
        metadata: { query_hash: hashText(query), not_proven_causality: true },
      }],
      raw_summary: { item_count: items.length },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, "Naver Local Search", sanitizeErrorReason(error)), startedAt);
  }
}

async function collectNaverSearchTrend(store, credentials = {}, {
  fetchImpl = globalThis.fetch,
  env = process.env,
  latestRevenueDate = null,
  timeoutMs = DEFAULT_TIMEOUTS.naver_search_trend,
} = {}) {
  const name = "naver_search_trend";
  const startedAt = Date.now();
  const clientId = credentials.naverSearchTrendClientId || credentials.naverClientId;
  const clientSecret = credentials.naverSearchTrendClientSecret || credentials.naverClientSecret;
  if (!clientId || !clientSecret) return withDuration(skipped(name, "Naver DataLab", "missing_key"), startedAt);
  const keywords = buildNaverSearchTrendKeywords(store);
  if (keywords.length === 0) return withDuration(skipped(name, "Naver DataLab", "missing_query_context"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, "Naver DataLab", "fetch_unavailable"), startedAt);

  const endpoint = credentials.naverDataLabSearchTrendEndpoint || "https://openapi.naver.com/v1/datalab/search";
  const endDate = isoDate(latestRevenueDate || new Date());
  const startDate = addDays(endDate, -30);
  const body = {
    startDate,
    endDate,
    timeUnit: env.NAVER_DATALAB_TIME_UNIT || "date",
    keywordGroups: [{
      groupName: "store_category_context",
      keywords,
    }],
  };
  const sourceRef = `naver_datalab_search:query_hash:${hashText(JSON.stringify(keywords))}:${startDate}:${endDate}`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      fetchImpl,
      headers: {
        "Content-Type": "application/json",
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      body: JSON.stringify(body),
    }, timeoutMs, { collector_name: name, source_ref: sourceRef });
    const result = await response.json();
    const data = normalizeArray(result?.results?.[0]?.data);
    if (data.length === 0) return withDuration(skipped(name, "Naver DataLab", "no_result"), startedAt);
    const latest = data[data.length - 1] || {};
    const previous = data[data.length - 2] || {};
    const latestRatio = numberOrNull(latest.ratio);
    const previousRatio = numberOrNull(previous.ratio);
    const ratioChange = latestRatio !== null && previousRatio !== null ? Math.round((latestRatio - previousRatio) * 100) / 100 : null;
    return withDuration(completed(name, "Naver DataLab", {
      observations: [{
        source_id: "naver_datalab_search_trend",
        source_name: "Naver DataLab",
        source_type: "search_trend",
        provider: "naver",
        source_url: "https://developers.naver.com/docs/serviceapi/datalab/search/search.md",
        source_ref: sourceRef,
        context_type: "search_trend",
        metric_name: "naver_search_ratio",
        metric_value: latestRatio,
        metric_unit: "relative_ratio",
        label: "검색 관심도 지표가 매출 변동 구간과 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
        observation_date: latest.period || endDate,
        region: store.region,
        metadata: {
          keyword_group_hash: hashText(JSON.stringify(keywords)),
          keyword_count: keywords.length,
          start_date: startDate,
          end_date: endDate,
          ratio_change: ratioChange,
          relative_search_trend_not_absolute_demand: true,
          not_proven_causality: true,
        },
      }],
      raw_summary: { result_count: result?.results?.length || 0, data_points: data.length },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, "Naver DataLab", sanitizeErrorReason(error)), startedAt);
  }
}

async function collectKoreanHolidayCalendar(store, credentials = {}, {
  fetchImpl = globalThis.fetch,
  env = process.env,
  latestRevenueDate = null,
  timeoutMs = DEFAULT_TIMEOUTS.korean_holiday_calendar,
} = {}) {
  const name = "korean_holiday_calendar";
  const startedAt = Date.now();
  const serviceKey = credentials.holidayServiceKey || credentials.dataGoKrServiceKey || credentials.kmaServiceKey;
  if (!serviceKey) return withDuration(skipped(name, "Korean Astronomy Holiday API", "missing_key"), startedAt);
  if (typeof fetchImpl !== "function") return withDuration(skipped(name, "Korean Astronomy Holiday API", "fetch_unavailable"), startedAt);
  const baseDate = isoDate(latestRevenueDate || new Date());
  const { url, sourceRef } = buildHolidayRequestUrl({
    baseUrl: credentials.holidayApiBaseUrl || env.HOLIDAY_API_BASE_URL || "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService",
    serviceKey,
    date: baseDate,
  });

  try {
    const response = await fetchWithTimeout(url, { fetchImpl }, timeoutMs, { collector_name: name, source_ref: sourceRef });
    const bodyText = await response.text();
    const parsed = parseHolidayResponse(bodyText);
    if (parsed.resultCode && parsed.resultCode !== "00") {
      return withDuration(failed(name, "Korean Astronomy Holiday API", `service_result_${parsed.resultCode}`), startedAt);
    }
    const observations = parsed.items.map((item) => normalizeHolidayObservation(item, store, sourceRef));
    return withDuration(completed(name, "Korean Astronomy Holiday API", {
      observations,
      raw_summary: {
        result_code: parsed.resultCode || null,
        result_msg: parsed.resultMsg || null,
        item_count: parsed.items.length,
        sol_year_month: baseDate.slice(0, 7),
      },
    }), startedAt);
  } catch (error) {
    return withDuration(failed(name, "Korean Astronomy Holiday API", sanitizeErrorReason(error)), startedAt);
  }
}

async function collectTossPlaceConnectorSmoke(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.toss_place_connector_smoke } = {}) {
  const name = "toss_place_connector_smoke";
  const startedAt = Date.now();
  const tossPlace = credentials.tossPlace || {};
  if (tossPlace.credentialLoadWarning) return withDuration(skipped(name, "Toss Place connector smoke", "secret_not_configured"), startedAt);
  if (!tossPlace.configured) return withDuration(skipped(name, "Toss Place connector smoke", tossPlace.credentialSource === "missing" ? "secret_not_configured" : "missing_credentials"), startedAt);
  const path = tossPlace.versionPath || tossPlace.merchantPath || tossPlace.ordersPath || tossPlace.paymentsPath;
  if (!path) return withDuration(skipped(name, "Toss Place connector smoke", "not_configured"), startedAt);
  const client = new TossPlaceClient({ credentials: tossPlace, fetchImpl, timeoutMs });
  const result = await client.smoke(path);
  const status = result.status === "completed" ? completed(name, "Toss Place connector smoke", {
    raw_summary: {
      status_code: result.status_code || null,
      endpoint_ref: `toss_place:endpoint_hash:${hashText(`${tossPlace.apiBaseUrl}${path}`)}`,
      foundation_only: true,
    },
  }) : result.status === "failed"
    ? failed(name, "Toss Place connector smoke", result.reason || "connector_error")
    : skipped(name, "Toss Place connector smoke", result.reason || "not_configured");
  status.observation_count = 0;
  return withDuration(status, startedAt);
}

async function collectDeliveryProviderConnectorSmoke(store, credentials = {}, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUTS.delivery_provider_connector_smoke } = {}) {
  const name = "delivery_provider_connector_smoke";
  const startedAt = Date.now();
  const deliveryProvider = credentials.deliveryProvider || {};
  if (deliveryProvider.credentialLoadWarning) return withDuration(skipped(name, "Delivery provider connector smoke", "secret_not_configured"), startedAt);
  if (!deliveryProvider.configured) return withDuration(skipped(name, "Delivery provider connector smoke", deliveryProvider.credentialSource === "missing" ? "secret_not_configured" : "missing_credentials"), startedAt);
  const client = new DeliveryProviderClient({ credentials: deliveryProvider, fetchImpl, timeoutMs });
  const result = await client.smoke();
  const status = result.status === "completed" ? completed(name, "Delivery provider connector smoke", {
    raw_summary: {
      provider_kind: result.provider_kind,
      normalized_row_count: result.normalized_rows?.length || 0,
      no_raw_login_automation: true,
    },
  }) : result.status === "failed"
    ? failed(name, "Delivery provider connector smoke", result.reason || "connector_error")
    : skipped(name, "Delivery provider connector smoke", result.reason || "not_configured");
  status.observation_count = 0;
  return withDuration(status, startedAt);
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
    collection_reason: result.collection_reason || null,
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

function connectorPlan(name, mode, liveAvailable, source) {
  if (mode === "seed") return { collector_name: name, status: "seed_ready", source, live_available: liveAvailable };
  if (mode === "live" && !liveAvailable) return { collector_name: name, status: "skipped_secret_not_configured", source, live_available: false };
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

function normalizeContextCollectionReason(reason) {
  const normalized = String(reason || "manual_refresh").trim() || "manual_refresh";
  if (!CONTEXT_COLLECTION_REASONS.includes(normalized)) {
    const error = new Error(`Invalid context collection reason: ${normalized}`);
    error.code = "invalid_body";
    throw error;
  }
  return normalized;
}

function logCollectorStatus(storeId, collector) {
  const payload = {
    route: "public_context_collect",
    store_id: storeId || null,
    collector_name: collector.name,
    status: collector.status,
    duration_ms: collector.duration_ms ?? null,
    reason: collector.reason || null,
    collection_reason: collector.collection_reason || null,
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

function buildNaverLocalQuery(store = {}) {
  const category = textValue(store.business_category);
  const region = textValue(store.region) || regionFromAddress(store.address_text);
  if (!category || !region) return null;
  return `${region} ${category}`;
}

function buildNaverSearchTrendKeywords(store = {}) {
  const metadata = store.metadata && typeof store.metadata === "object" && !Array.isArray(store.metadata) ? store.metadata : {};
  const rawCategory = textValue(store.business_category);
  const categoryLabel = textValue(metadata.business_category_label)
    || textValue(metadata.business_category_label_ko)
    || humanizeBusinessCategory(rawCategory);
  const category = normalizeSearchCategory(categoryLabel || rawCategory);
  const region = textValue(store.region) || regionFromAddress(store.address_text);
  const regionParts = splitKoreanRegion(region);
  const storeName = normalizeStoreSearchName(textValue(store.store_name));
  const menuKeywords = Array.isArray(metadata.representative_menu_keywords)
    ? metadata.representative_menu_keywords.map(textValue).filter(Boolean)
    : [];

  const keywords = [];

  if (storeName) keywords.push(storeName);
  if (regionParts.dong && category) keywords.push(`${regionParts.dong} ${category}`);
  if (regionParts.gu && category) keywords.push(`${regionParts.gu} ${category}`);
  if (region && category) keywords.push(`${region} ${category}`);

  if (regionParts.dong) {
    keywords.push(`${regionParts.dong} 맛집`);
    if (/양식|western|파스타|이탈리/i.test(categoryLabel || rawCategory)) {
      keywords.push(`${regionParts.dong} 양식`, `${regionParts.dong} 파스타`, `${regionParts.dong} 레스토랑`);
    }
    if (/카페|커피|cafe|coffee/i.test(categoryLabel || rawCategory)) {
      keywords.push(`${regionParts.dong} 카페`, `${regionParts.dong} 디저트`, `${regionParts.dong} 커피`);
    }
    if (/한식|korean/i.test(categoryLabel || rawCategory)) {
      keywords.push(`${regionParts.dong} 한식`, `${regionParts.dong} 밥집`);
    }
    if (/중식|chinese/i.test(categoryLabel || rawCategory)) {
      keywords.push(`${regionParts.dong} 중식`, `${regionParts.dong} 중국집`);
    }
    if (/치킨/i.test(categoryLabel || rawCategory)) {
      keywords.push(`${regionParts.dong} 치킨`, `${regionParts.dong} 배달`);
    }
  }

  keywords.push(...menuKeywords);

  if (category) keywords.push(category);

  return [...new Set(
    keywords
      .map((keyword) => keyword.replace(/음식점/g, "").replace(/점$/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((keyword) => !/^CS\d+$/i.test(keyword))
  )].slice(0, 20);
}

function humanizeBusinessCategory(category) {
  const value = textValue(category);
  const map = {
    CS100001: "한식",
    CS100002: "중식",
    CS100003: "일식",
    CS100004: "양식",
    CS100005: "제과점",
    CS100006: "패스트푸드",
    CS100007: "치킨",
    CS100008: "분식",
    CS100009: "호프",
    CS100010: "커피",
  };
  return map[value] || value;
}

function normalizeSearchCategory(category) {
  const value = textValue(category)
    .replace(/음식점/g, "")
    .replace(/전문점/g, "")
    .replace(/점$/g, "")
    .trim();

  if (/양식|western/i.test(value)) return "양식";
  if (/카페|커피|cafe|coffee/i.test(value)) return "카페";
  if (/한식|korean/i.test(value)) return "한식";
  if (/중식|chinese/i.test(value)) return "중식";
  if (/일식|japanese/i.test(value)) return "일식";
  if (/분식/i.test(value)) return "분식";
  if (/치킨/i.test(value)) return "치킨";
  return value;
}

function splitKoreanRegion(region) {
  const parts = textValue(region).split(/\s+/).filter(Boolean);
  return {
    sido: parts.find((part) => /시$|도$|서울|경기|부산|대구|인천|광주|대전|울산|세종/.test(part)) || parts[0] || "",
    gu: parts.find((part) => /구$|군$|시$/.test(part) && !/특별시$|광역시$/.test(part)) || "",
    dong: parts.find((part) => /동$|가$|로$|읍$|면$/.test(part)) || "",
  };
}

function normalizeStoreSearchName(name) {
  return textValue(name)
    .replace(/\s+Tenant$/i, "")
    .replace(/\s*매장$/g, "")
    .trim();
}

function normalizeNaverLocalItem(item = {}) {
  return {
    title: stripHtml(item.title),
    category: stripHtml(item.category),
    address: stripHtml(item.address),
    road_address: stripHtml(item.roadAddress || item.road_address),
    mapx: textValue(item.mapx),
    mapy: textValue(item.mapy),
  };
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function buildHolidayRequestUrl({ baseUrl, serviceKey, date }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const url = new URL(base.endsWith("/getRestDeInfo") ? base : `${base}/getRestDeInfo`);
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("solYear", date.slice(0, 4));
  url.searchParams.set("solMonth", date.slice(5, 7));
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", url.searchParams.get("numOfRows") || "100");
  url.searchParams.set("pageNo", url.searchParams.get("pageNo") || "1");
  const sanitized = new URL(url.toString());
  sanitized.searchParams.set("ServiceKey", "***");
  return { url: url.toString(), sourceRef: sanitized.toString() };
}

function parseHolidayResponse(bodyText) {
  const trimmed = String(bodyText || "").trim();
  if (!trimmed) return { resultCode: null, resultMsg: null, items: [] };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    const response = json?.response || json;
    const items = normalizeArray(response?.body?.items?.item || response?.items?.item || response?.item || []);
    return {
      resultCode: textValue(response?.header?.resultCode || json?.resultCode),
      resultMsg: textValue(response?.header?.resultMsg || json?.resultMsg),
      items,
    };
  }
  const headerCode = xmlValue(trimmed, "resultCode");
  const headerMsg = xmlValue(trimmed, "resultMsg");
  const itemMatches = [...trimmed.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return {
    resultCode: headerCode,
    resultMsg: headerMsg,
    items: itemMatches.map((match) => ({
      dateName: xmlValue(match[1], "dateName"),
      locdate: xmlValue(match[1], "locdate"),
      isHoliday: xmlValue(match[1], "isHoliday"),
    })),
  };
}

function normalizeHolidayObservation(item = {}, store = {}, sourceRef) {
  const locdate = textValue(item.locdate);
  const observationDate = /^\d{8}$/.test(locdate) ? `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}` : null;
  const dateName = textValue(item.dateName);
  return {
    source_id: "korean_astronomy_holiday_api",
    source_name: "Korean Astronomy Holiday API",
    source_type: "calendar",
    provider: "data_go_kr_spcdeinfo",
    source_url: "https://www.data.go.kr/",
    source_ref: sourceRef,
    context_type: "calendar",
    metric_name: "holiday_or_special_day",
    metric_value: 1,
    metric_unit: "flag",
    label: "공휴일/특일 일정이 매출 변동 구간과 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
    observation_date: observationDate,
    region: store.region,
    metadata: {
      date_name: dateName || null,
      is_holiday: textValue(item.isHoliday) || null,
      locdate: locdate || null,
      not_proven_causality: true,
    },
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value === "undefined" || value === "") return [];
  return [value];
}

function regionFromAddress(addressText) {
  const parts = String(addressText || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).join(" ");
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return new Date().toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function textValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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
  return Boolean(
    credentials?.kakaoRestApiKey
    || credentials?.seoulOpenDataKey
    || credentials?.kmaServiceKey
    || credentials?.dataGoKrServiceKey
    || (credentials?.naverClientId && credentials?.naverClientSecret)
    || credentials?.holidayServiceKey
    || credentials?.tossPlace?.configured
    || credentials?.deliveryProvider?.configured
  );
}

module.exports = {
  LIVE_KEY_NAMES,
  COLLECTOR_NAMES,
  CONTEXT_COLLECTION_REASONS,
  DEFAULT_TIMEOUTS,
  getConfiguredContextKeys,
  planStorePublicContextCollection,
  normalizeCollectorFilter,
  normalizeContextCollectionReason,
  fetchWithTimeout,
  collectStorePublicContext,
  geocodeStoreAddress: collectKakaoStoreLocation,
  collectKakaoStoreLocation,
  collectKmaWeather,
  buildKmaRequestUrl,
  parseKmaWeatherResponse,
  parseKmaWeatherEnvelope,
  buildKmaEndpointPlan,
  detectKmaEndpointKind,
  generateKmaBaseTimeCandidates,
  normalizeWeatherObservations,
  fetchSeoulOpenDataDataset,
  collectSeoulCommercialBenchmark,
  collectSeoulFootTrafficProxy,
  collectSeoulStoreDensityProxy,
  collectNaverLocalCompetitorSearch,
  collectNaverSearchTrend,
  collectKoreanHolidayCalendar,
  collectTossPlaceConnectorSmoke,
  collectDeliveryProviderConnectorSmoke,
  buildHolidayRequestUrl,
  parseHolidayResponse,
};
