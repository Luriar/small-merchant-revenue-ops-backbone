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

function planStorePublicContextCollection({ mode = "auto", env = process.env } = {}) {
  const configuredKeys = getConfiguredContextKeys(env);
  const liveAvailable = configuredKeys.length > 0;
  const resolvedMode = mode === "auto" ? (liveAvailable ? "live" : "seed") : mode;
  return {
    requested_mode: mode,
    resolved_mode: resolvedMode,
    live_keys_present: configuredKeys,
    safe_to_run_without_keys: true,
    collectors: [
      collectorPlan("holiday", resolvedMode, liveAvailable, "Korean holiday calendar"),
      collectorPlan("weather", resolvedMode, Boolean(env.KMA_SERVICE_KEY), "KMA weather"),
      collectorPlan("commercial_benchmark", resolvedMode, Boolean(env.SEOUL_OPEN_DATA_KEY || env.DATA_GO_KR_SERVICE_KEY), "Seoul commercial district benchmark"),
      collectorPlan("geocoding", resolvedMode, Boolean(env.KAKAO_REST_API_KEY), "Kakao Local API"),
      collectorPlan("foot_traffic_proxy", resolvedMode, Boolean(env.SEOUL_OPEN_DATA_KEY), "Seoul living population/subway proxy"),
      collectorPlan("nearby_store_density", resolvedMode, Boolean(env.DATA_GO_KR_SERVICE_KEY), "Small Enterprise commercial information"),
    ],
  };
}

function collectorPlan(name, mode, liveAvailable, source) {
  if (mode === "seed") {
    return { collector_name: name, status: "seed_ready", source, live_available: liveAvailable };
  }
  if (mode === "live" && !liveAvailable) {
    return { collector_name: name, status: "skipped_missing_key", source, live_available: false };
  }
  return { collector_name: name, status: "live_ready", source, live_available: true };
}

module.exports = {
  LIVE_KEY_NAMES,
  getConfiguredContextKeys,
  planStorePublicContextCollection,
};
