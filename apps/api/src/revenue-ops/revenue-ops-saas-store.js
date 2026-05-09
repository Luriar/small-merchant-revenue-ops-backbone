const { randomUUID } = require("node:crypto");

const exportData = require("./data/revenue_ops_export.json");
const m6DemoDataset = require("./data/m6_demo_revenue_dataset.json");
const { getJwtClaimsFromEvent, normalizeClaims } = require("./revenue-ops-auth");
const { VALID_ACTION_STATUSES } = require("./revenue-ops-store");
const { planStorePublicContextCollection, normalizeContextCollectionReason } = require("./context-collectors");
const { previewRevenueUploadPayload, canonicalChannel } = require("./revenue-upload-parsers");

const DEFAULT_DEMO_PROFILE = m6DemoDataset.stores[0];
const DEMO_STORE_NAME = DEFAULT_DEMO_PROFILE.store_name;
const DEMO_TENANT_NAME = DEFAULT_DEMO_PROFILE.tenant_name;
const RELIABILITY_NOTE_KO = "이 분석은 업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 인과가 확정된 것은 아니며, 실행 전 추가 확인이 필요합니다.";
const RELIABILITY_NOTE_EN = "This analysis combines uploaded revenue data with public context signals. It does not prove causality and should be reviewed before execution.";
const BOOTSTRAP_REASON = "store_onboarding_bootstrap";

const ROLE_RANK = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

function createRevenueOpsSaasStore({ data = exportData, clock = () => new Date() } = {}) {
  const state = {
    users: new Map(),
    tenants: new Map(),
    tenantMembers: [],
    stores: new Map(),
    storeMembers: [],
    briefs: [],
    anomalies: [],
    actions: [],
    contexts: [],
    uploads: [],
    rawRows: [],
    rejectedRows: [],
    dailyFacts: [],
    itemFacts: [],
    contextSources: new Map(),
    contextObservations: [],
    publicBenchmarks: [],
    contextLinks: [],
    storeLocations: new Map(),
    commercialAreaMappings: [],
    nearbyStoreSnapshots: [],
    collectorRuns: [],
    causeCandidates: [],
    causeEvidence: [],
    outcomes: [],
    outboxEvents: [],
    jobRuns: [],
    martBuildRuns: [],
    dailyMart: [],
  };

  function nowIso() {
    return clock().toISOString();
  }

  function newId(prefix) {
    return `${prefix}_${randomUUID()}`;
  }

  function resolveAppUserFromJwtClaims(claims) {
    const normalized = normalizeClaims(claims);
    const existing = state.users.get(normalized.cognito_sub);
    const timestamp = nowIso();

    if (existing) {
      existing.email = normalized.email ?? existing.email;
      existing.display_name = normalized.display_name ?? existing.display_name;
      existing.last_login_at = timestamp;
      existing.updated_at = timestamp;
      return clone(existing);
    }

    const user = {
      app_user_id: newId("usr"),
      cognito_sub: normalized.cognito_sub,
      email: normalized.email,
      display_name: normalized.display_name,
      status: "active",
      last_login_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.users.set(user.cognito_sub, user);
    return clone(user);
  }

  function requireAuthenticatedAppUser(event) {
    return resolveAppUserFromJwtClaims(event?.authClaims ?? getJwtClaimsFromEvent(event) ?? event);
  }

  function requireStoreAccess(appUserId, storeId, minimumRole = "viewer") {
    const member = state.storeMembers.find((item) => (
      item.store_id === storeId
      && item.app_user_id === appUserId
      && item.status === "active"
    ));

    if (!member) {
      return null;
    }

    if ((ROLE_RANK[member.role] ?? 0) < (ROLE_RANK[minimumRole] ?? 0)) {
      return null;
    }

    return clone(member);
  }

  function listStoresForUser(appUserId) {
    let stores = listActiveStoresForUser(appUserId);
    if (stores.length === 0) {
      seedDemoStoresForUser(appUserId);
      stores = listActiveStoresForUser(appUserId);
    }
    return stores;
  }

  function listActiveStoresForUser(appUserId) {
    return state.storeMembers
      .filter((member) => member.app_user_id === appUserId && member.status === "active")
      .map((member) => {
        const store = state.stores.get(member.store_id);
        if (!store || store.status !== "active" || store.status === "archived") {
          return null;
        }
        const tenant = state.tenants.get(store.tenant_id);
        return {
          ...clone(store),
          member_role: member.role,
          tenant_name: tenant?.tenant_name ?? null,
          tenant_type: tenant?.tenant_type ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  function createStoreForUser(appUserId, payload = {}) {
    const storeName = text(payload.store_name);
    const businessCategory = text(payload.business_category);
    const addressText = text(payload.address_text);
    const isDemoTenant = text(payload.tenant_type) === "demo" || text(payload.store_type) === "demo";
    const metadata = safeObject(payload.metadata);
    const addressSource = text(metadata.address_source) || text(payload.address_source);
    const addressSelected = metadata.address_selected === true
      || payload.address_selected === true
      || addressSource === "postcode_search"
      || addressSource === "search";

    // Required-field validation. Demo seeds bypass via tenant_type/store_type=demo.
    if (!isDemoTenant) {
      const missing = [];
      if (!storeName) missing.push("store_name");
      if (!businessCategory) missing.push("business_category");
      if (!addressText) missing.push("address_text");
      if (addressText && !addressSelected) missing.push("address_selected");

      if (missing.length > 0) {
        const err = new Error(
          "가게 이름, 업종, 주소는 필수입니다. 주소는 주소 검색을 통해 선택해 주세요."
        );
        err.code = "INVALID_STORE_INPUT";
        err.statusCode = 400;
        err.details = { missing };
        throw err;
      }
    } else if (!storeName) {
      const err = new Error("store_name is required");
      err.code = "invalid_body";
      throw err;
    }

    const timestamp = nowIso();
    const tenant = {
      tenant_id: newId("ten"),
      tenant_name: text(payload.tenant_name) || `${storeName} Tenant`,
      tenant_type: text(payload.tenant_type) || "merchant",
      status: "active",
      created_by: appUserId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const store = {
      store_id: newId("store"),
      tenant_id: tenant.tenant_id,
      store_name: storeName,
      store_type: text(payload.store_type) || "single_store",
      business_category: businessCategory || null,
      region: text(payload.region) || null,
      address_text: addressText || null,
      timezone: text(payload.timezone) || "Asia/Seoul",
      status: "active",
      metadata: {
        ...metadata,
        ...(addressSource ? { address_source: addressSource } : {}),
        ...(addressSelected ? { address_selected: true } : {}),
      },
      created_by: appUserId,
      created_at: timestamp,
      updated_at: timestamp,
    };

    state.tenants.set(tenant.tenant_id, tenant);
    state.stores.set(store.store_id, store);
    state.tenantMembers.push({
      tenant_id: tenant.tenant_id,
      app_user_id: appUserId,
      role: "owner",
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    });
    state.storeMembers.push({
      store_id: store.store_id,
      app_user_id: appUserId,
      role: "owner",
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    });

    seedStoreScaffold(store);
    return clone({
      ...store,
      member_role: "owner",
      tenant_name: tenant.tenant_name,
      tenant_type: tenant.tenant_type,
    });
  }

  function updateStoreForUser(appUserId, storeId, payload = {}) {
    const member = requireStoreAccess(appUserId, storeId, "owner");
    if (!member) {
      const err = new Error("Store access is required");
      err.code = "forbidden";
      err.statusCode = 403;
      throw err;
    }
    const store = state.stores.get(storeId);
    if (!store || store.status === "archived") {
      const err = new Error("Store not found");
      err.code = "not_found";
      err.statusCode = 404;
      throw err;
    }

    const timestamp = nowIso();
    const next = { ...store };
    if (Object.prototype.hasOwnProperty.call(payload, "store_name")) {
      const value = text(payload.store_name);
      if (!value) {
        const err = new Error("store_name cannot be empty");
        err.code = "INVALID_STORE_INPUT";
        err.statusCode = 400;
        throw err;
      }
      next.store_name = value;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "business_category")) {
      const value = text(payload.business_category);
      if (!value) {
        const err = new Error("business_category cannot be empty");
        err.code = "INVALID_STORE_INPUT";
        err.statusCode = 400;
        throw err;
      }
      next.business_category = value;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "address_text")) {
      const value = text(payload.address_text);
      const incomingMeta = safeObject(payload.metadata);
      const addressSource = text(incomingMeta.address_source) || text(payload.address_source);
      const addressSelected = incomingMeta.address_selected === true
        || payload.address_selected === true
        || addressSource === "postcode_search"
        || addressSource === "search";
      if (!value || !addressSelected) {
        const err = new Error("주소는 주소 검색을 통해 선택해 주세요.");
        err.code = "INVALID_STORE_INPUT";
        err.statusCode = 400;
        throw err;
      }
      next.address_text = value;
      next.metadata = {
        ...safeObject(next.metadata),
        ...incomingMeta,
        address_source: addressSource,
        address_selected: true,
      };
    }
    if (Object.prototype.hasOwnProperty.call(payload, "region")) {
      next.region = text(payload.region) || null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "metadata") && payload.address_text === undefined) {
      next.metadata = { ...safeObject(next.metadata), ...safeObject(payload.metadata) };
    }
    next.updated_at = timestamp;
    state.stores.set(storeId, next);
    const tenant = state.tenants.get(next.tenant_id);
    return clone({
      ...next,
      member_role: member.role,
      tenant_name: tenant?.tenant_name ?? null,
      tenant_type: tenant?.tenant_type ?? null,
    });
  }

  function archiveStoreForUser(appUserId, storeId) {
    const member = requireStoreAccess(appUserId, storeId, "owner");
    if (!member) {
      const err = new Error("Store access is required");
      err.code = "forbidden";
      err.statusCode = 403;
      throw err;
    }
    const store = state.stores.get(storeId);
    if (!store) {
      const err = new Error("Store not found");
      err.code = "not_found";
      err.statusCode = 404;
      throw err;
    }
    const timestamp = nowIso();
    state.stores.set(storeId, {
      ...store,
      status: "archived",
      updated_at: timestamp,
    });
    // Soft-archive store membership entries so the store hides from default lists.
    for (const m of state.storeMembers) {
      if (m.store_id === storeId && m.app_user_id === appUserId) {
        m.status = "archived";
        m.updated_at = timestamp;
      }
    }
    return { store_id: storeId, status: "archived", archived_at: timestamp };
  }

  function seedDemoStoreForUser(appUserId) {
    return seedDemoStoresForUser(appUserId)[0] ?? null;
  }

  function seedDemoStoresForUser(appUserId) {
    const seeded = [];
    for (const profile of m6DemoDataset.stores ?? []) {
      const existing = state.storeMembers
        .filter((member) => member.app_user_id === appUserId)
        .map((member) => state.stores.get(member.store_id))
        .find((store) => store?.store_type === "demo" && store?.metadata?.demo_scenario === profile.demo_scenario);

      const store = existing ?? createStoreForUser(appUserId, {
        tenant_name: profile.tenant_name,
        tenant_type: "demo",
        store_name: profile.store_name,
        store_type: "demo",
        business_category: profile.business_category,
        region: profile.region,
        address_text: profile.address_text,
        timezone: "Asia/Seoul",
        metadata: profile.metadata,
      });
      seedStoreContent(store.store_id);
      seeded.push(state.stores.get(store.store_id) ?? store);
    }
    return seeded;
  }

  function seedStoreScaffold(store) {
    if (!state.storeLocations.has(store.store_id)) {
      const timestamp = nowIso();
      state.storeLocations.set(store.store_id, {
        store_id: store.store_id,
        address_text: store.address_text,
        latitude: store.store_type === "demo" ? 37.5446 : null,
        longitude: store.store_type === "demo" ? 127.0557 : null,
        region: store.region,
        administrative_dong: store.store_type === "demo" ? "Seongsu-dong" : null,
        legal_dong: store.store_type === "demo" ? "Seongsu-dong" : null,
        geocode_provider: store.store_type === "demo" ? "manual_seed" : null,
        geocode_status: store.store_type === "demo" ? "manual_seed" : "pending",
        metadata: {
          exact_location_claim: false,
        },
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
  }

  function seedStoreContent(storeId) {
    if (state.briefs.some((item) => item.store_id === storeId)) {
      return;
    }

    const timestamp = nowIso();
    const store = state.stores.get(storeId);
    const profile = demoProfileForStore(store);
    if (store?.store_type !== "demo" && !profile) {
      return;
    }
    seedRevenueFacts(storeId, timestamp, profile);
    seedContextForStore(storeId, timestamp);
    seedCauseActionLoop(storeId, timestamp);

    state.briefs.push(...(data.briefs ?? []).map((brief) => ({
      ...clone(brief),
      store_id: storeId,
      store_name: store?.store_name ?? DEMO_STORE_NAME,
      trade_area_name: store?.region ?? brief.trade_area_name,
      service_category_name: store?.business_category ?? brief.service_category_name,
      headline: `${store?.store_name ?? DEMO_STORE_NAME}: 매출 변화와 공개 맥락 신호가 함께 관측되었습니다`,
      summary: "업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 가능성 높은 원인 후보가 있으나 인과가 확정된 것은 아닙니다. 추가 확인이 필요합니다.",
      reliability_note: RELIABILITY_NOTE_KO,
      generated_at: timestamp,
    })));

    state.anomalies.push(...(data.anomalies ?? []).map((anomaly) => ({
      ...clone(anomaly),
      store_id: storeId,
      trade_area_name: store?.region ?? anomaly.trade_area_name,
      service_category_name: store?.business_category ?? anomaly.service_category_name,
      interpretation_note: "Revenue change pattern only. It is not proven causality.",
    })));

    state.contexts.push(...(data.context ?? []).map((context) => ({
      ...clone(context),
      store_id: storeId,
      store_name: store?.store_name ?? DEMO_STORE_NAME,
      trade_area_name: store?.region ?? context.trade_area_name,
      service_category_name: store?.business_category ?? context.service_category_name,
      reliability_note: RELIABILITY_NOTE_KO,
    })));
  }

  function seedRevenueFacts(storeId, timestamp, profile = null) {
    if (state.dailyFacts.some((row) => row.store_id === storeId)) {
      return;
    }

    const uploadId = `upload_seed_${storeId}`;
    const dailyRows = profile?.revenue_daily_rows ?? buildSyntheticDailyRows();
    const itemRows = buildSyntheticItemRows(dailyRows);

    state.uploads.push({
      upload_id: uploadId,
      store_id: storeId,
      uploaded_by: null,
      source_type: "m6_synthetic_demo_seed",
      original_filename: profile ? `${profile.demo_scenario}.json` : "synthetic_daily_revenue.csv",
      file_type: "csv",
      status: "accepted",
      row_count: dailyRows.length + itemRows.length,
      accepted_count: dailyRows.length + itemRows.length,
      rejected_count: 0,
      metadata: {
        is_demo: true,
        demo_scenario: profile?.demo_scenario ?? "seongsu_cafe_seed",
        generated_for: "m6_presentation",
        synthetic_notice: "Not real individual store revenue. Realistic synthetic POS data calibrated by public commercial-district benchmark assumptions.",
      },
      created_at: timestamp,
      updated_at: timestamp,
    });

    state.dailyFacts.push(...dailyRows.map((row) => ({
      ...row,
      store_id: storeId,
      source_upload_id: uploadId,
      created_at: timestamp,
      updated_at: timestamp,
    })));
    state.itemFacts.push(...itemRows.map((row) => ({
      ...row,
      store_id: storeId,
      source_upload_id: uploadId,
      created_at: timestamp,
      updated_at: timestamp,
    })));
  }

  function seedContextForStore(storeId, timestamp) {
    const store = state.stores.get(storeId);
    const region = store?.region ?? "Seoul Seongsu";
    const category = store?.business_category ?? "cafe";
    ensureContextSource({
      source_id: "manual_seed_weather",
      source_name: "Manual seed weather context",
      source_type: "weather",
      provider: "manual_seed",
      attribution: "Synthetic weather context for demo validation",
      refresh_granularity: "seed",
    });
    ensureContextSource({
      source_id: "manual_seed_commercial_benchmark",
      source_name: "Manual seed commercial district benchmark",
      source_type: "benchmark",
      provider: "manual_seed",
      attribution: "Synthetic public benchmark assumptions for Seongsu cafe demo",
      refresh_granularity: "seed",
    });
    ensureContextSource({
      source_id: "manual_seed_foot_traffic",
      source_name: "Manual seed foot traffic proxy",
      source_type: "foot_traffic",
      provider: "manual_seed",
      attribution: "Synthetic foot traffic proxy for demo validation",
      refresh_granularity: "seed",
    });

    const observations = [
      {
        source_id: "manual_seed_weather",
        observation_date: "2026-04-16",
        context_type: "weather",
        metric_name: "rainfall_mm",
        metric_value: 38,
        metric_unit: "mm",
        label: "비 오는 날 오프라인 매출 하락 신호와 함께 관측되었습니다",
        region,
      },
      {
        source_id: "manual_seed_foot_traffic",
        observation_date: "2026-04-16",
        context_type: "foot_traffic",
        metric_name: "foot_traffic_proxy_delta_pct",
        metric_value: -14,
        metric_unit: "pct",
        label: "유동인구 프록시 하락이 함께 관측되었습니다",
        region,
      },
      {
        source_id: "manual_seed_commercial_benchmark",
        observation_date: "2026-04-17",
        context_type: "benchmark",
        metric_name: "commercial_area_sales_delta_pct",
        metric_value: -8,
        metric_unit: "pct",
        label: "상권 벤치마크 약세가 함께 관측되었습니다",
        region,
      },
      {
        source_id: "manual_seed_commercial_benchmark",
        observation_date: "2026-04-18",
        context_type: "competition",
        metric_name: "same_category_store_count",
        metric_value: 61,
        metric_unit: "stores",
        label: "동종 업종 점포 밀도는 원인 후보일 뿐 추가 확인이 필요합니다",
        region,
      },
    ];

    for (const observation of observations) {
      const exists = state.contextObservations.some((row) => (
        row.store_id === storeId
        && row.observation_date === observation.observation_date
        && row.context_type === observation.context_type
        && row.metric_name === observation.metric_name
      ));
      if (exists) {
        continue;
      }

      const row = {
        observation_id: newId("ctx"),
        store_id: storeId,
        raw_payload: {},
        fetched_at: timestamp,
        created_at: timestamp,
        ...observation,
      };
      state.contextObservations.push(row);
      state.contextLinks.push({
        store_id: storeId,
        observation_id: row.observation_id,
        link_type: "manual_seed",
        strength: observation.context_type === "weather" ? "strong" : "medium",
        created_at: timestamp,
      });
    }

    if (!state.publicBenchmarks.some((row) => row.region === region && row.business_category === category)) {
      state.publicBenchmarks.push({
        benchmark_id: newId("bench"),
        source_id: "manual_seed_commercial_benchmark",
        region,
        commercial_area_code: null,
        business_category: category,
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        sales_amount: 148000000,
        transaction_count: 14800,
        avg_transaction_value: 10000,
        metadata: {
          exact_official_area_code: false,
          copy_guardrail: "benchmark observed together; not proven causality",
        },
        fetched_at: timestamp,
        created_at: timestamp,
      });
    }

    if (!state.commercialAreaMappings.some((row) => row.store_id === storeId)) {
      state.commercialAreaMappings.push({
        mapping_id: newId("area"),
        store_id: storeId,
        commercial_area_code: null,
        commercial_area_name: `${region} seed label`,
        administrative_dong: region,
        business_category: category,
        mapping_method: "manual_seed",
        confidence: "medium",
        metadata: {
          official_code_verified: false,
        },
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    if (!state.nearbyStoreSnapshots.some((row) => row.store_id === storeId)) {
      state.nearbyStoreSnapshots.push({
        snapshot_id: newId("nearby"),
        store_id: storeId,
        snapshot_date: "2026-04-18",
        radius_m: 500,
        business_category: category,
        same_category_store_count: 61,
        total_store_count: 228,
        source_id: "manual_seed_commercial_benchmark",
        metadata: {
          source_mode: "manual_seed",
          exact_competitor_locations: false,
        },
        created_at: timestamp,
      });
    }
  }

  function ensureContextSource(source) {
    if (state.contextSources.has(source.source_id)) {
      return;
    }
    const timestamp = nowIso();
    state.contextSources.set(source.source_id, {
      provider: null,
      source_url: null,
      license_type: null,
      metadata: {},
      created_at: timestamp,
      updated_at: timestamp,
      ...source,
    });
  }

  function seedCauseActionLoop(storeId, timestamp) {
    if (state.causeCandidates.some((row) => row.store_id === storeId && row.status !== "superseded")) {
      return;
    }

    const candidates = [
      {
        cause_candidate_id: newId("cause"),
        store_id: storeId,
        candidate_type: "rainy_day_offline_drop",
        title: "비 오는 날 오프라인 주문 하락 가능성",
        summary: "비 오는 날과 오프라인 주문 하락이 함께 관측되었습니다. 인과가 확정된 것은 아니며 추가 확인이 필요합니다.",
        confidence: "medium",
        status: "active",
        metric_name: "net_sales_amount",
        baseline_start: "2026-03-16",
        baseline_end: "2026-04-14",
        compare_start: "2026-04-15",
        compare_end: "2026-04-21",
        observed_delta_pct: -17.6,
        created_from: "seed_rule",
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        cause_candidate_id: newId("cause"),
        store_id: storeId,
        candidate_type: "item_category_decline",
        title: "디저트 결합률 하락 가능성",
        summary: "커피 매출 대비 디저트 판매 비중 하락이 함께 관측되었습니다. 가능성 높은 원인 후보이며 추가 확인이 필요합니다.",
        confidence: "medium",
        status: "active",
        metric_name: "item_mix_bakery_share",
        baseline_start: "2026-03-16",
        baseline_end: "2026-04-14",
        compare_start: "2026-04-15",
        compare_end: "2026-04-21",
        observed_delta_pct: -11.2,
        created_from: "seed_rule",
        created_at: timestamp,
        updated_at: timestamp,
      },
    ];
    state.causeCandidates.push(...candidates);

    state.causeEvidence.push(
      {
        evidence_id: newId("evi"),
        cause_candidate_id: candidates[0].cause_candidate_id,
        evidence_type: "weather",
        strength: "medium",
        summary: "2026-04-16 강수량 38mm와 오프라인 매출 하락이 함께 관측되었습니다.",
        source_name: "Manual seed weather context",
        source_ref: "manual_seed_weather",
        metric_name: "rainfall_mm",
        metric_value: 38,
        metadata: { not_proven_causality: true },
        created_at: timestamp,
      },
      {
        evidence_id: newId("evi"),
        cause_candidate_id: candidates[1].cause_candidate_id,
        evidence_type: "item_mix",
        strength: "medium",
        summary: "디저트 품목 판매량 하락이 매출 하락 기간과 함께 관측되었습니다.",
        source_name: "Synthetic POS seed",
        source_ref: "synthetic_seed",
        metric_name: "bakery_quantity_delta_pct",
        metric_value: -11.2,
        metadata: { not_proven_causality: true },
        created_at: timestamp,
      },
    );

    const exportedActions = data.actions ?? [];
    const ruleActions = [
      {
        cause: candidates[0],
        title: "비 오는 날 배달/포장 세트 메뉴를 테스트하세요",
        description: "비 예보가 있는 날에 커피+디저트 포장 세트를 작게 테스트합니다.",
        action_family: "rainy_day_delivery_boost",
        expected_effect: "오프라인 방문 하락 구간에서 배달/포장 전환을 관측합니다.",
      },
      {
        cause: candidates[1],
        title: "커피+디저트 세트 구성을 테스트하세요",
        description: "디저트 결합률 하락 구간에 맞춰 소금빵/휘낭시에 세트 구성을 테스트합니다.",
        action_family: "bundle_attach_rate_recovery",
        expected_effect: "객단가와 디저트 결합률 변화를 다음 2주 동안 관측합니다.",
      },
    ];

    for (const item of ruleActions) {
      upsertSeedAction({
        storeId,
        causeCandidateId: item.cause.cause_candidate_id,
        actionFamily: item.action_family,
        title: item.title,
        description: item.description,
        whyThisAction: `${item.cause.summary} 이 액션은 근거 기반 제안이며 효과가 보장되지는 않습니다.`,
        expectedEffect: item.expected_effect,
        riskNote: "인과가 확정된 것은 아닙니다. 실행 전 추가 확인이 필요합니다.",
        timestamp,
      });
    }

    for (const exported of exportedActions.slice(0, 4)) {
      upsertSeedAction({
        storeId,
        causeCandidateId: candidates[0].cause_candidate_id,
        actionFamily: normalizeFamily(exported.action_type),
        title: exported.title,
        description: exported.description,
        whyThisAction: `${exported.why_this_action || exported.description} 관측 신호 기반의 원인 후보이며 추가 확인이 필요합니다.`,
        expectedEffect: exported.expected_effect,
        riskNote: exported.risk_note || "효과가 보장되지 않으며 인과가 확정된 것은 아닙니다.",
        timestamp,
        externalActionId: exported.action_id,
        anomalyId: exported.anomaly_id,
      });
    }
  }

  function upsertSeedAction({
    storeId,
    causeCandidateId,
    actionFamily,
    title,
    description,
    whyThisAction,
    expectedEffect,
    riskNote,
    timestamp,
    externalActionId,
    anomalyId,
  }) {
    const dedupeKey = `${storeId}:${actionFamily}:${causeCandidateId}:${normalizeText(title)}`;
    if (state.actions.some((item) => item.store_id === storeId && item.dedupe_key === dedupeKey)) {
      return;
    }
    state.actions.push({
      action_id: externalActionId ? `${storeId}:${externalActionId}` : newId("act"),
      store_id: storeId,
      anomaly_id: anomalyId || null,
      cause_candidate_id: causeCandidateId,
      action_family: actionFamily,
      dedupe_key: dedupeKey,
      action_type: actionFamily,
      title,
      description,
      why_this_action: whyThisAction,
      expected_effect: expectedEffect,
      risk_note: riskNote,
      difficulty: "medium",
      status: "recommended",
      planned_start_date: null,
      planned_end_date: null,
      completed_at: null,
      status_updated_by: null,
      outcome_summary: "결과 추적 대기 중",
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  function ensureCauseCandidatesForStore(storeId) {
    const timestamp = nowIso();
    seedContextForStore(storeId, timestamp);
    if (!state.dailyFacts.some((row) => row.store_id === storeId)) {
      return [];
    }
    if (!state.causeCandidates.some((row) => row.store_id === storeId && row.status !== "superseded")) {
      seedCauseActionLoop(storeId, timestamp);
    }
    return clone(state.causeCandidates
      .filter((row) => row.store_id === storeId && row.status !== "superseded")
      .map((candidate) => ({
        ...candidate,
        evidence: filterEvidenceForQuality(state.causeEvidence.filter((row) => row.cause_candidate_id === candidate.cause_candidate_id)),
      })));
  }

  function ensureActionPlannerItemsForStore(storeId) {
    if (!state.dailyFacts.some((row) => row.store_id === storeId)) {
      return [];
    }
    const timestamp = nowIso();
    const candidates = ensureCauseCandidatesForStore(storeId);
    for (const candidate of candidates) {
      const action = actionForCauseCandidate(candidate);
      upsertSeedAction({
        storeId,
        causeCandidateId: candidate.cause_candidate_id,
        actionFamily: action.action_family,
        title: action.title,
        description: action.description,
        whyThisAction: `${candidate.summary} 이 액션은 근거 기반 제안이며 효과가 보장되지는 않습니다.`,
        expectedEffect: action.expected_effect,
        riskNote: "인과가 확정된 것은 아닙니다. 실행 전 추가 확인이 필요합니다.",
        timestamp,
      });
    }
    return clone(state.actions
      .filter((action) => action.store_id === storeId)
      .map((action) => withCauseAndOutcome(action)));
  }

  function actionForCauseCandidate(candidate) {
    const byType = {
      rainy_day_offline_drop: {
        action_family: "rainy_day_delivery_boost",
        title: "비 오는 날 배달/포장 세트 메뉴를 테스트하세요",
        description: "비 예보가 있는 날에 커피+디저트 포장 세트를 작게 테스트합니다.",
        expected_effect: "오프라인 방문 하락 구간에서 배달/포장 전환과 주문수 변화를 관측합니다.",
      },
      item_category_decline: {
        action_family: "bundle_attach_rate_recovery",
        title: "커피+디저트 세트 구성을 테스트하세요",
        description: "품목 믹스 변화 구간에 맞춰 세트 구성을 작게 테스트합니다.",
        expected_effect: "객단가와 결합률 변화를 다음 측정 기간에 관측합니다.",
      },
      benchmark_downturn: {
        action_family: "benchmark_watch",
        title: "상권 약세 구간에서는 재방문 액션을 우선 검토하세요",
        description: "신규 유입 확대보다 재방문 쿠폰/스탬프 액션을 작은 범위로 테스트합니다.",
        expected_effect: "재방문 주문수와 매출 방어 정도를 관측합니다.",
      },
      order_count_decline: {
        action_family: "offpeak_promotion",
        title: "하락 시간대에 맞춘 짧은 프로모션을 테스트하세요",
        description: "주문수 하락 구간에 한정해 짧은 메뉴 프로모션을 실행합니다.",
        expected_effect: "주문수 회복 여부를 다음 측정 기간에 관측합니다.",
      },
      foot_traffic_drop: {
        action_family: "offpeak_promotion",
        title: "유동인구 약세 시간대에 맞춘 짧은 프로모션을 테스트하세요",
        description: "유동인구 프록시 약세 구간과 겹치는 시간대에 작게 테스트합니다.",
        expected_effect: "주문수와 객단가 변화를 함께 관측합니다.",
      },
    };
    return byType[candidate.candidate_type] ?? {
      action_family: "data_quality_check",
      title: "매출/맥락 데이터 품질을 먼저 점검하세요",
      description: "원인 후보를 실행 액션으로 옮기기 전에 업로드 기간, 누락일, 공개 맥락 연결을 확인합니다.",
      expected_effect: "다음 분석에서 근거 품질과 실행 우선순위가 더 명확해지는지 관측합니다.",
    };
  }

  function getBriefsForStore(storeId) {
    const store = state.stores.get(storeId);
    if (isDemoStoreRecord(store)) {
      seedStoreContent(storeId);
    }
    const facts = state.dailyFacts.filter((row) => row.store_id === storeId);
    if (facts.length === 0) {
      return [];
    }
    ensureActionPlannerItemsForStore(storeId);

    // For real stores with an accepted upload, compose the brief from latest
    // facts so /briefs reflects the uploaded period instead of the seed
    // brief's "2024Q4" placeholder.
    const latestUpload = latestBy(state.uploads.filter((row) => row.store_id === storeId), "created_at");
    const isRealUpload = latestUpload && latestUpload.source_type !== "m6_synthetic_demo_seed";
    if (isRealUpload || !isDemoStoreRecord(store)) {
      return [composeBriefFromFacts(storeId, store, facts, latestUpload)];
    }

    const briefs = state.briefs.filter((brief) => brief.store_id === storeId);
    if (!briefs.length) {
      return [composeBriefFromFacts(storeId, store, facts, latestUpload)];
    }
    // Even the seeded brief gets dedupe + caution sanitizing.
    return briefs.map((brief) => sanitizeBriefShape(brief, storeId));
  }

  function composeBriefFromFacts(storeId, store, facts, latestUpload) {
    const causeCandidates = state.causeCandidates.filter((row) => row.store_id === storeId);
    const causeEvidence = state.causeEvidence.filter((row) =>
      causeCandidates.some((cand) => cand.cause_candidate_id === row.cause_candidate_id),
    );
    const actions = state.actions.filter((row) => row.store_id === storeId);
    const latestCollectorRun = latestBy(
      state.collectorRuns.filter((row) => row.target_store_id === storeId || row.store_id === storeId),
      "completed_at",
    ) || latestBy(state.collectorRuns.filter((row) => row.target_store_id === storeId || row.store_id === storeId), "created_at");
    return composeBriefFromUploadedFacts({
      storeId,
      store,
      facts,
      causeCandidates,
      causeEvidence,
      actions,
      latestUpload,
      latestCollectorRun,
    });
  }

  function sanitizeBriefShape(brief, storeId) {
    const cloned = clone(brief);
    cloned.summary = sanitizeCautionText(cloned.summary);
    cloned.headline = sanitizeCautionText(cloned.headline);
    cloned.reliability_note = sanitizeCautionText(cloned.reliability_note);
    if (Array.isArray(cloned.top_cause_candidates)) {
      cloned.top_cause_candidates = dedupeCauseCandidates(cloned.top_cause_candidates).map((candidate) => ({
        ...candidate,
        summary: sanitizeCautionText(candidate.summary),
      }));
    } else {
      cloned.top_cause_candidates = [];
    }
    if (Array.isArray(cloned.recommended_actions)) {
      cloned.recommended_actions = dedupeActionsByFamily(cloned.recommended_actions).map((action) => ({
        ...action,
        why_this_action: sanitizeCautionText(action.why_this_action),
        risk_note: sanitizeCautionText(action.risk_note),
      }));
    } else {
      cloned.recommended_actions = [];
    }
    cloned.store_id = storeId;
    return cloned;
  }

  function getAnomaliesForStore(storeId) {
    const store = state.stores.get(storeId);
    if (isDemoStoreRecord(store)) {
      seedStoreContent(storeId);
    }
    if (!state.dailyFacts.some((row) => row.store_id === storeId)) {
      return [];
    }
    const anomalies = state.anomalies.filter((anomaly) => anomaly.store_id === storeId);
    return clone(anomalies.length ? anomalies : buildAnomaliesFromFacts(storeId));
  }

  function getContextForStore(storeId) {
    seedContextForStore(storeId, nowIso());
    return clone([
      ...state.contexts.filter((context) => context.store_id === storeId),
      {
        store_id: storeId,
        context_observations: state.contextObservations
          .filter((row) => row.store_id === storeId)
          .map((row) => ({
            ...row,
            source: state.contextSources.get(row.source_id) ?? null,
          })),
        benchmarks: state.publicBenchmarks.filter((row) => row.region === "Seoul Seongsu"),
        nearby_store_snapshots: state.nearbyStoreSnapshots.filter((row) => row.store_id === storeId),
        commercial_area_mappings: state.commercialAreaMappings.filter((row) => row.store_id === storeId),
        reliability_note: RELIABILITY_NOTE_KO,
        reliability_note_en: RELIABILITY_NOTE_EN,
      },
    ]);
  }

  function getPipelineMetaForStore(storeId) {
    const store = state.stores.get(storeId);
    if (isDemoStoreRecord(store)) {
      seedStoreContent(storeId);
    }
    const latestUpload = latestBy(state.uploads.filter((row) => row.store_id === storeId), "created_at");
    const latestContext = latestBy(state.contextObservations.filter((row) => row.store_id === storeId), "fetched_at");
    const latestBenchmark = latestBy(state.publicBenchmarks, "fetched_at");
    const latestCollectorRun = latestBy(state.collectorRuns.filter((row) => row.target_store_id === storeId), "created_at");
    const latestCollectorMetadata = safeObject(latestCollectorRun?.metadata);
    const latestMartBuild = latestBy(state.martBuildRuns.filter((row) => row.store_id === storeId), "created_at");

    return clone({
      store_id: storeId,
      store_name: store?.store_name ?? null,
      latest_revenue_upload: latestUpload,
      latest_context_observation: latestContext,
      latest_public_benchmark_period: latestBenchmark ? {
        period_start: latestBenchmark.period_start,
        period_end: latestBenchmark.period_end,
        source_id: latestBenchmark.source_id,
      } : null,
      latest_collector_run: latestCollectorRun,
      latest_context_collection_reason: latestCollectorMetadata.reason ?? null,
      latest_mart_build: latestMartBuild,
      context_freshness_note: latestContext
        ? "공개 맥락 데이터가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다."
        : "공개 맥락 데이터가 아직 충분하지 않습니다.",
      bronze: ["revenue_uploads", "revenue_upload_raw_rows", "revenue_upload_rejected_rows"],
      silver: ["revenue_daily_facts", "revenue_item_facts", "context_observations", "public_revenue_benchmarks", "store_context_links"],
      gold: ["cause_candidates", "cause_candidate_evidence", "action_planner_items", "action_outcome_snapshots"],
      data_reliability_note: RELIABILITY_NOTE_KO,
      data_reliability_note_en: RELIABILITY_NOTE_EN,
      export_compatibility: {
        legacy_revenue_routes_remain_enabled: true,
        store_scoped_routes_primary: true,
      },
    });
  }

  async function getActionsForStore(storeId) {
    return ensureActionPlannerItemsForStore(storeId);
  }

  async function updateActionStatusForStore({ appUserId, storeId, actionId, status, planned_start_date, planned_end_date }) {
    if (!VALID_ACTION_STATUSES.includes(status)) {
      const err = new Error(`Invalid status '${status}'. Valid: ${VALID_ACTION_STATUSES.join(", ")}`);
      err.code = "invalid_status";
      throw err;
    }

    const action = state.actions.find((item) => item.store_id === storeId && item.action_id === actionId);
    if (!action) {
      return null;
    }

    const timestamp = nowIso();
    action.status = status;
    action.planned_start_date = parseDate(planned_start_date) || action.planned_start_date;
    action.planned_end_date = parseDate(planned_end_date) || action.planned_end_date;
    action.status_updated_by = appUserId;
    action.updated_at = timestamp;

    if (status === "done") {
      action.completed_at = timestamp;
      ensureOutcomePlaceholder(action, timestamp);
    }
    createOutboxEvent({
      event_type: "action.status.changed",
      aggregate_type: "action",
      aggregate_id: action.action_id,
      store_id: storeId,
      idempotency_key: `action.status.changed:${storeId}:${action.action_id}:${status}:${timestamp}`,
      payload: {
        action_id: action.action_id,
        status,
        not_proven_causality: true,
      },
    });

    return clone(withCauseAndOutcome(action));
  }

  function evaluateActionOutcome(actionId) {
    const action = state.actions.find((item) => item.action_id === actionId);
    if (!action) return null;
    return buildActionOutcomeForStore(action.store_id, actionId);
  }

  function buildActionOutcomeForStore(storeId, actionId) {
    const action = state.actions.find((item) => item.store_id === storeId && item.action_id === actionId);
    if (!action) return null;
    const outcome = latestBy(state.outcomes.filter((row) => row.action_id === actionId), "created_at");
    return clone(outcome ?? {
      action_id: actionId,
      store_id: storeId,
      metric_name: "net_sales_amount",
      summary: "결과 추적 대기 중",
      summary_en: "Waiting for result window",
      not_proven_causality: true,
    });
  }

  function withCauseAndOutcome(action) {
    const cause = state.causeCandidates.find((row) => row.cause_candidate_id === action.cause_candidate_id) ?? null;
    const evidence = cause
      ? state.causeEvidence.filter((row) => row.cause_candidate_id === cause.cause_candidate_id).slice(0, 3)
      : [];
    const outcome = latestBy(state.outcomes.filter((row) => row.action_id === action.action_id), "created_at");

    return {
      ...action,
      cause_candidate: cause ? clone(cause) : null,
      evidence_snippets: clone(evidence),
      outcome_tracking: outcome ? clone(outcome) : {
        summary: "결과 추적 대기 중",
        summary_en: "Waiting for result window",
      },
    };
  }

  function ensureOutcomePlaceholder(action, timestamp) {
    const exists = state.outcomes.some((row) => row.action_id === action.action_id);
    if (exists) {
      return;
    }

    state.outcomes.push({
      outcome_id: newId("outcome"),
      action_id: action.action_id,
      store_id: action.store_id,
      baseline_start: null,
      baseline_end: null,
      result_start: null,
      result_end: null,
      metric_name: "net_sales_amount",
      baseline_value: null,
      result_value: null,
      observed_delta_pct: null,
      summary: "결과 추적 대기 중. 실행 효과를 단정하지 않습니다.",
      created_at: timestamp,
    });
  }

  function getCauseCandidatesForStore(storeId) {
    return ensureCauseCandidatesForStore(storeId);
  }

  function getCauseCandidateForStore(storeId, causeCandidateId) {
    return getCauseCandidatesForStore(storeId).find((row) => row.cause_candidate_id === causeCandidateId) ?? null;
  }

  function ingestRevenueUpload({ appUserId, storeId, payload = {} }) {
    const prepared = prepareRevenueUploadRows(payload);
    const dailyRows = prepared.dailyRows;
    const itemRows = prepared.itemRows;
    const rows = [
      ...dailyRows.map((row, index) => ({ kind: "daily", row, index })),
      ...itemRows.map((row, index) => ({ kind: "item", row, index })),
    ];
    if (rows.length === 0 && prepared.rejectedRows.length === 0) {
      const err = new Error("daily_rows or item_rows is required");
      err.code = "invalid_body";
      throw err;
    }

    const timestamp = nowIso();
    const upload = {
      upload_id: newId("upload"),
      store_id: storeId,
      uploaded_by: appUserId,
      source_type: text(payload.source_type) || "manual_template",
      original_filename: text(payload.original_filename) || null,
      file_type: text(payload.file_type) || "json",
      status: "uploaded",
      row_count: rows.length + prepared.rejectedRows.length,
      accepted_count: 0,
      rejected_count: 0,
      metadata: { ...safeObject(payload.metadata), ...prepared.metadata },
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.uploads.push(upload);

    // Additive opt-in: when payload.metadata.overwrite_mode === 'by_date_channel',
    // accepted daily rows replace any prior daily facts for the same
    // (store_id, business_date, channel) from older uploads. Default behavior
    // (no flag) is unchanged — existing rows remain alongside new ones.
    const overwriteMode = text(upload.metadata?.overwrite_mode);
    const supersedeKeys = new Set();

    for (const row of rows) {
      state.rawRows.push({
        raw_row_id: state.rawRows.length + 1,
        upload_id: upload.upload_id,
        row_number: row.index + 1,
        row_payload: sanitizeRevenueRow(row.row),
        created_at: timestamp,
      });

      const normalized = row.kind === "daily"
        ? normalizeDailyRow(row.row)
        : normalizeItemRow(row.row);

      if (!normalized.ok) {
        upload.rejected_count += 1;
        state.rejectedRows.push({
          rejected_row_id: state.rejectedRows.length + 1,
          upload_id: upload.upload_id,
          row_number: row.index + 1,
          reason_code: normalized.reason_code,
          reason_message: normalized.reason_message,
          raw_row_preview: sanitizeRevenueRow(row.row),
          created_at: timestamp,
        });
        continue;
      }

      upload.accepted_count += 1;
      if (row.kind === "daily") {
        state.dailyFacts.push({
          ...normalized.value,
          store_id: storeId,
          source_upload_id: upload.upload_id,
          created_at: timestamp,
          updated_at: timestamp,
        });
        if (overwriteMode === "by_date_channel") {
          supersedeKeys.add(`${normalized.value.business_date}::${normalized.value.channel}`);
        }
      } else {
        state.itemFacts.push({
          ...normalized.value,
          store_id: storeId,
          source_upload_id: upload.upload_id,
          created_at: timestamp,
          updated_at: timestamp,
        });
      }
    }

    if (overwriteMode === "by_date_channel" && supersedeKeys.size > 0) {
      // Drop prior daily facts for the same (store, date, canonical channel)
      // that came from a different upload. Compare against the canonical
      // channel so legacy rows stored as "offline_pos" or "오프라인" are
      // superseded by a new "offline" row, not duplicated alongside it.
      const survivors = state.dailyFacts.filter((row) => {
        if (row.store_id !== storeId) return true;
        if (row.source_upload_id === upload.upload_id) return true;
        const key = `${row.business_date}::${canonicalChannel(row.channel)}`;
        return !supersedeKeys.has(key);
      });
      state.dailyFacts.length = 0;
      state.dailyFacts.push(...survivors);
    }

    for (const rejectedRow of prepared.rejectedRows) {
      upload.rejected_count += 1;
      state.rejectedRows.push({
        rejected_row_id: state.rejectedRows.length + 1,
        upload_id: upload.upload_id,
        row_number: rejectedRow.row_number,
        reason_code: rejectedRow.reason_code,
        reason_message: rejectedRow.reason_message,
        raw_row_preview: sanitizeRevenueRow(rejectedRow.raw_row_preview),
        created_at: timestamp,
      });
    }

    upload.status = upload.rejected_count === 0
      ? "accepted"
      : upload.accepted_count > 0
        ? "partially_accepted"
        : "failed";
    upload.updated_at = timestamp;
    createOutboxEvent({
      event_type: upload.accepted_count > 0 ? "revenue.upload.accepted" : "revenue.upload.failed",
      aggregate_type: "revenue_upload",
      aggregate_id: upload.upload_id,
      store_id: storeId,
      idempotency_key: `revenue.upload:${upload.upload_id}`,
      payload: {
        source_type: upload.source_type,
        accepted_count: upload.accepted_count,
        rejected_count: upload.rejected_count,
      },
    });
    if (upload.accepted_count > 0) {
      rebuildCauseAndActionsAfterUpload(storeId, upload, timestamp);
    }

    return clone({
      upload,
      accepted_count: upload.accepted_count,
      rejected_count: upload.rejected_count,
      rejected_rows: state.rejectedRows.filter((row) => row.upload_id === upload.upload_id),
    });
  }

  function rebuildCauseAndActionsAfterUpload(storeId, upload, timestamp) {
    // Supersede prior generated cause candidates whose latest source upload
    // differs. The currently accepted upload becomes the active source.
    const factsForUpload = state.dailyFacts.filter((row) => row.store_id === storeId && row.source_upload_id === upload.upload_id);
    if (factsForUpload.length === 0) {
      return;
    }
    const totalDays = state.dailyFacts.filter((row) => row.store_id === storeId).length;

    // For 1-row uploads we don't generate new candidates — keep existing items
    // but still mark prior generated candidates as superseded so the brief
    // reflects insufficient_data state.
    for (const candidate of state.causeCandidates) {
      if (candidate.store_id !== storeId) continue;
      if (candidate.created_from === "user_managed") continue;
      candidate.status = "superseded";
      candidate.superseded_at = timestamp;
      candidate.updated_at = timestamp;
    }
    // Drop generated actions that are still in the default 'recommended' state.
    // Preserve user-modified actions (selected/planned/done/dismissed).
    const preserved = state.actions.filter((action) => action.store_id !== storeId
      || action.status !== "recommended"
      || action.status_updated_by);
    state.actions.length = 0;
    state.actions.push(...preserved);

    if (totalDays >= 2) {
      // Re-seed the cause/action loop with the latest facts as basis. The
      // existing seedCauseActionLoop is no-op when candidates exist, so we
      // call ensureActionPlannerItemsForStore which creates fresh items if
      // none remain active.
      seedCauseActionLoop(storeId, timestamp);
      ensureActionPlannerItemsForStore(storeId);
    }
  }

  function previewRevenueUpload(payload = {}) {
    return previewRevenueUploadPayload(payload);
  }

  function listRevenueUploadsForStore(storeId) {
    return clone(state.uploads
      .filter((upload) => upload.store_id === storeId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  function listRejectedRowsForUpload(storeId, uploadId) {
    const upload = state.uploads.find((item) => item.store_id === storeId && item.upload_id === uploadId);
    if (!upload) {
      return null;
    }
    return clone(state.rejectedRows.filter((row) => row.upload_id === uploadId));
  }

  function getRejectedRowsForUpload(storeId, uploadId) {
    return listRejectedRowsForUpload(storeId, uploadId);
  }

  function reprocessRevenueUpload(storeId, uploadId) {
    const upload = state.uploads.find((item) => item.store_id === storeId && item.upload_id === uploadId);
    if (!upload) {
      return null;
    }
    const jobRun = createJobRun({
      job_type: "upload_parse",
      target_kind: "upload",
      target_id: uploadId,
      store_id: storeId,
      status: "skipped",
      input_payload: { upload_id: uploadId },
      result_summary: {
        message: "Reprocess skeleton recorded. No destructive rewrite was performed.",
      },
    });
    return clone({ job_run: jobRun, upload });
  }

  function collectContextForStore(storeId, { mode = "seed", collectors = null, reason: requestedReason = "manual_refresh" } = {}) {
    const timestamp = nowIso();
    const reason = normalizeContextCollectionReason(requestedReason);
    const collectionPlan = planStorePublicContextCollection({ mode, collectors });
    const collectorResults = collectionPlan.collectors.map((collector) => ({
      name: collector.collector_name,
      status: "skipped",
      source_name: collector.source,
      observation_count: 0,
      reason: "memory_store_uses_seed_context",
      collection_reason: reason,
      duration_ms: 0,
      freshness: null,
      collected_at: timestamp,
    }));
    const jobRun = createJobRun({
      job_type: "context_collect",
      target_kind: "store",
      target_id: storeId,
      store_id: storeId,
      status: "running",
      started_at: timestamp,
      input_payload: { mode, collectors, reason, resolved_mode: collectionPlan.resolved_mode },
    });
    seedContextForStore(storeId, timestamp);
    const run = {
      collector_run_id: newId("collector"),
      collector_name: "collectStorePublicContext",
      status: "completed",
      target_store_id: storeId,
      started_at: timestamp,
      completed_at: timestamp,
      error_message: null,
      metadata: {
        mode,
        reason,
        resolved_mode: collectionPlan.resolved_mode,
        collectors: collectorResults,
        total_duration_ms: 0,
        global_budget_ms: 20000,
        completed_collector_count: 0,
        skipped_collector_count: collectorResults.length,
        failed_collector_count: 0,
        timed_out_collector_count: 0,
        external_api_keys_required: false,
        skipped_live_collectors_without_keys: true,
      },
      created_at: timestamp,
    };
    state.collectorRuns.push(run);
    updateJobRun(jobRun.job_run_id, {
      status: "completed",
      completed_at: timestamp,
      result_summary: {
        collector_run_id: run.collector_run_id,
      },
    });
    ensureActionPlannerItemsForStore(storeId);
    return clone({
      collector_run: run,
      job_run: state.jobRuns.find((row) => row.job_run_id === jobRun.job_run_id),
      summary: {
        context_observation_count: state.contextObservations.filter((row) => row.store_id === storeId).length,
        benchmark_count: state.publicBenchmarks.length,
        nearby_snapshot_count: state.nearbyStoreSnapshots.filter((row) => row.store_id === storeId).length,
        completed_collector_count: 0,
        skipped_collector_count: collectorResults.length,
        failed_collector_count: 0,
        timed_out_collector_count: 0,
        total_duration_ms: 0,
        global_budget_ms: 20000,
        collectors: collectorResults,
        collector_plan: collectionPlan,
      },
    });
  }

  function createOutboxEvent(event = {}) {
    const timestamp = nowIso();
    const existing = event.idempotency_key
      ? state.outboxEvents.find((row) => row.idempotency_key === event.idempotency_key)
      : null;
    if (existing) {
      return clone(existing);
    }
    const row = {
      event_id: newId("evt"),
      event_type: text(event.event_type),
      aggregate_type: text(event.aggregate_type),
      aggregate_id: text(event.aggregate_id),
      tenant_id: event.tenant_id ?? null,
      store_id: event.store_id ?? null,
      idempotency_key: event.idempotency_key ?? null,
      payload: safeObject(event.payload),
      status: event.status || "pending",
      retry_count: 0,
      available_at: event.available_at || timestamp,
      published_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.outboxEvents.push(row);
    return clone(row);
  }

  function markOutboxPublished(eventId) {
    const event = state.outboxEvents.find((row) => row.event_id === eventId);
    if (!event) return null;
    const timestamp = nowIso();
    event.status = "published";
    event.published_at = timestamp;
    event.updated_at = timestamp;
    return clone(event);
  }

  function createJobRun(payload = {}) {
    const timestamp = nowIso();
    const row = {
      job_run_id: newId("job"),
      job_type: payload.job_type,
      target_kind: payload.target_kind ?? null,
      target_id: payload.target_id ?? null,
      tenant_id: payload.tenant_id ?? null,
      store_id: payload.store_id ?? null,
      status: payload.status || "pending",
      started_at: payload.started_at ?? null,
      completed_at: payload.completed_at ?? null,
      error_code: payload.error_code ?? null,
      error_message: payload.error_message ?? null,
      input_payload: safeObject(payload.input_payload),
      result_summary: safeObject(payload.result_summary),
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.jobRuns.push(row);
    return clone(row);
  }

  function updateJobRun(jobRunId, patch = {}) {
    const row = state.jobRuns.find((item) => item.job_run_id === jobRunId);
    if (!row) return null;
    Object.assign(row, {
      status: patch.status ?? row.status,
      completed_at: patch.completed_at ?? row.completed_at,
      error_code: patch.error_code ?? row.error_code,
      error_message: patch.error_message ?? row.error_message,
      result_summary: patch.result_summary ? safeObject(patch.result_summary) : row.result_summary,
      updated_at: nowIso(),
    });
    return clone(row);
  }

  function createMartBuildRun(payload = {}) {
    const timestamp = nowIso();
    const row = {
      mart_build_run_id: newId("mart_run"),
      store_id: payload.store_id,
      build_type: payload.build_type || "daily_revenue",
      input_window_start: payload.input_window_start ?? null,
      input_window_end: payload.input_window_end ?? null,
      source_upload_id: payload.source_upload_id ?? null,
      context_cutoff_at: payload.context_cutoff_at ?? null,
      status: payload.status || "pending",
      rows_written: payload.rows_written ?? 0,
      error_message: payload.error_message ?? null,
      created_at: timestamp,
      completed_at: payload.completed_at ?? null,
    };
    state.martBuildRuns.push(row);
    return clone(row);
  }

  function buildStoreRevenueDailyMart(storeId, range = {}) {
    const started = createMartBuildRun({
      store_id: storeId,
      build_type: "daily_revenue",
      input_window_start: range.start_date ?? null,
      input_window_end: range.end_date ?? null,
      status: "running",
    });
    const facts = state.dailyFacts
      .filter((row) => row.store_id === storeId)
      .filter((row) => !range.start_date || row.business_date >= range.start_date)
      .filter((row) => !range.end_date || row.business_date <= range.end_date)
      .sort((a, b) => a.business_date.localeCompare(b.business_date));
    let rowsWritten = 0;
    for (const fact of facts) {
      const previous = facts.find((row) => row.business_date === addDays(fact.business_date, -7));
      const aov = fact.order_count > 0 ? Math.round((fact.net_sales_amount / fact.order_count) * 100) / 100 : 0;
      const previousAov = previous?.order_count > 0 ? previous.net_sales_amount / previous.order_count : null;
      const existingIndex = state.dailyMart.findIndex((row) => row.store_id === storeId && row.business_date === fact.business_date);
      const rain = state.contextObservations.find((row) => row.store_id === storeId && row.observation_date === fact.business_date && row.metric_name === "rainfall_mm");
      const benchmark = state.contextObservations.find((row) => row.store_id === storeId && row.observation_date === fact.business_date && row.metric_name === "commercial_area_sales_delta_pct");
      const footTraffic = state.contextObservations.find((row) => row.store_id === storeId && row.observation_date === fact.business_date && row.metric_name === "foot_traffic_proxy_delta_pct");
      const martRow = {
        store_id: storeId,
        business_date: fact.business_date,
        net_sales_amount: fact.net_sales_amount,
        gross_sales_amount: fact.gross_sales_amount,
        order_count: fact.order_count,
        aov,
        cancel_count: fact.cancel_count,
        refund_amount: fact.refund_amount,
        discount_amount: fact.discount_amount,
        sales_delta_vs_prev_weekday_pct: percentageDelta(fact.net_sales_amount, previous?.net_sales_amount),
        order_delta_vs_prev_weekday_pct: percentageDelta(fact.order_count, previous?.order_count),
        aov_delta_vs_prev_weekday_pct: percentageDelta(aov, previousAov),
        weather_label: rain?.label ?? null,
        rain_mm: rain?.metric_value ?? null,
        holiday_flag: false,
        local_event_flag: false,
        benchmark_delta_pct: benchmark?.metric_value ?? null,
        foot_traffic_proxy_delta_pct: footTraffic?.metric_value ?? null,
        same_category_store_count: state.nearbyStoreSnapshots.find((row) => row.store_id === storeId)?.same_category_store_count ?? null,
        top_declining_category: null,
        evidence_readiness_score: rain || benchmark || footTraffic ? 0.8 : 0.45,
        built_at: nowIso(),
        source_summary: {
          revenue_source_upload_id: fact.source_upload_id,
          context_observed_together: Boolean(rain || benchmark || footTraffic),
          not_proven_causality: true,
        },
      };
      if (existingIndex >= 0) {
        state.dailyMart[existingIndex] = martRow;
      } else {
        state.dailyMart.push(martRow);
      }
      rowsWritten += 1;
    }
    const run = state.martBuildRuns.find((row) => row.mart_build_run_id === started.mart_build_run_id);
    run.status = "completed";
    run.rows_written = rowsWritten;
    run.completed_at = nowIso();
    createOutboxEvent({
      event_type: "mart.daily_revenue.built",
      aggregate_type: "store",
      aggregate_id: storeId,
      store_id: storeId,
      idempotency_key: `mart.daily_revenue.built:${storeId}:${run.mart_build_run_id}`,
      payload: { rows_written: rowsWritten },
    });
    return clone({ mart_build_run: run, rows_written: rowsWritten });
  }

  function getStoreRevenueDailyMart(storeId, range = {}) {
    return clone(state.dailyMart
      .filter((row) => row.store_id === storeId)
      .filter((row) => !range.start_date || row.business_date >= range.start_date)
      .filter((row) => !range.end_date || row.business_date <= range.end_date)
      .sort((a, b) => b.business_date.localeCompare(a.business_date)));
  }

  return {
    _state: state,
    resolveAppUserFromJwtClaims,
    requireAuthenticatedAppUser,
    requireStoreAccess,
    listStoresForUser,
    createStoreForUser,
    updateStoreForUser,
    archiveStoreForUser,
    getBriefsForStore,
    getAnomaliesForStore,
    getContextForStore,
    getPipelineMetaForStore,
    ensureCauseCandidatesForStore,
    ensureActionPlannerItemsForStore,
    getActionsForStore,
    updateActionStatusForStore,
    getCauseCandidatesForStore,
    getCauseCandidateForStore,
    ingestRevenueUpload,
    previewRevenueUpload,
    listRevenueUploadsForStore,
    listRejectedRowsForUpload,
    getRejectedRowsForUpload,
    reprocessRevenueUpload,
    collectContextForStore,
    createOutboxEvent,
    markOutboxPublished,
    createJobRun,
    updateJobRun,
    createMartBuildRun,
    buildStoreRevenueDailyMart,
    getStoreRevenueDailyMart,
    evaluateActionOutcome,
    buildActionOutcomeForStore,
  };
}

function normalizeDailyRow(row) {
  const businessDate = parseDate(row?.business_date);
  if (!businessDate) {
    return rejected("invalid_business_date", "business_date is required in YYYY-MM-DD format");
  }
  const orderCount = int(row.order_count, 0);
  if (orderCount < 0) {
    return rejected("invalid_order_count", "order_count must be zero or greater");
  }
  const gross = money(row.gross_sales_amount);
  const net = money(row.net_sales_amount);
  const refund = money(row.refund_amount);
  const discount = money(row.discount_amount);
  // Manual/JSON path commonly omits net_sales_amount; fall back to gross
  // (less discount/refund) so daily_series, KPI cards and AOV don't compute
  // from zero. CSV path already does the same in the parser's normalizer.
  const netSales = net > 0 ? net : Math.max(0, gross - discount - refund);
  return accepted({
    business_date: businessDate,
    channel: canonicalChannel(row.channel),
    gross_sales_amount: gross,
    net_sales_amount: netSales,
    order_count: orderCount,
    cancel_count: int(row.cancel_count ?? row.cancellation_count, 0),
    cancellation_count: int(row.cancellation_count ?? row.cancel_count, 0),
    refund_amount: refund,
    discount_amount: discount,
    delivery_fee_amount: money(row.delivery_fee_amount),
    commission_amount: money(row.commission_amount),
    settlement_amount: money(row.settlement_amount),
    payment_card_amount: money(row.payment_card_amount),
    payment_cash_amount: money(row.payment_cash_amount),
    source_file_type: text(row.source_file_type) || null,
    source_row_number: int(row.source_row_number, 0) || null,
  });
}

function normalizeItemRow(row) {
  const businessDate = parseDate(row?.business_date);
  if (!businessDate) {
    return rejected("invalid_business_date", "business_date is required in YYYY-MM-DD format");
  }
  const itemName = text(row.item_name);
  if (!itemName) {
    return rejected("missing_item_name", "item_name is required");
  }
  return accepted({
    business_date: businessDate,
    channel: canonicalChannel(row.channel),
    item_name: itemName,
    item_category: text(row.item_category) || null,
    quantity: int(row.quantity, 0),
    gross_sales_amount: money(row.gross_sales_amount),
    discount_amount: money(row.discount_amount),
    net_sales_amount: money(row.net_sales_amount),
  });
}

function buildSyntheticDailyRows() {
  const rows = [];
  const start = Date.UTC(2026, 2, 1);
  for (let day = 0; day < 75; day += 1) {
    const date = new Date(start + day * 86400000);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 5 || dow === 6;
    const monday = dow === 1;
    const rainDrop = day >= 45 && day <= 51 ? 0.82 : 1;
    const promoLift = day >= 58 && day <= 64 ? 1.11 : 1;
    const hotLift = day >= 65 ? 1.05 : 1;
    const baseOrders = weekend ? 126 : monday ? 78 : 96;
    const orderCount = Math.round((baseOrders + ((day * 7) % 13) - 6) * rainDrop * promoLift);
    const aov = (weekend ? 10200 : monday ? 8600 : 9200) + ((day * 113) % 900);
    const gross = Math.round(orderCount * aov * hotLift);
    const refundAmount = Math.round(gross * (0.006 + ((day % 5) * 0.002)));
    const discountAmount = Math.round(gross * (promoLift > 1 ? 0.06 : 0.025));
    const net = gross - refundAmount - discountAmount;
    const card = Math.round(net * 0.88);
    const cash = Math.round(net * 0.05);
    rows.push({
      business_date: date.toISOString().slice(0, 10),
      channel: "offline_pos",
      gross_sales_amount: gross,
      net_sales_amount: net,
      order_count: orderCount,
      cancel_count: Math.max(0, Math.round(orderCount * 0.01)),
      refund_amount: refundAmount,
      discount_amount: discountAmount,
      payment_card_amount: card,
      payment_cash_amount: cash,
    });
  }
  return rows;
}

function buildSyntheticItemRows(dailyRows) {
  const mix = [
    ["아메리카노", "coffee", 0.29, 4500],
    ["카페라떼", "coffee", 0.18, 5400],
    ["바닐라라떼", "coffee", 0.1, 5900],
    ["콜드브루", "coffee", 0.09, 5600],
    ["말차라떼", "non_coffee", 0.08, 6200],
    ["레몬에이드", "non_coffee", 0.06, 6100],
    ["소금빵", "bakery", 0.08, 3800],
    ["휘낭시에", "bakery", 0.05, 3200],
    ["크로플", "bakery", 0.04, 6800],
    ["샌드위치", "food", 0.03, 8500],
  ];

  return dailyRows.flatMap((dayRow, index) => {
    const anomalyFactor = index >= 45 && index <= 51 ? 0.85 : 1;
    return mix.map(([itemName, itemCategory, share, price]) => {
      const qty = Math.max(1, Math.round(dayRow.order_count * share * (itemCategory === "bakery" ? anomalyFactor : 1)));
      const gross = qty * price;
      return {
        business_date: dayRow.business_date,
        channel: "offline_pos",
        item_name: itemName,
        item_category: itemCategory,
        quantity: qty,
        gross_sales_amount: gross,
        discount_amount: Math.round(gross * 0.02),
        net_sales_amount: Math.round(gross * 0.98),
      };
    });
  });
}

function buildBriefFromFacts(storeId) {
  return {
    brief_id: `brief_${storeId}`,
    store_id: storeId,
    store_name: DEMO_STORE_NAME,
    trade_area_name: "Seoul Seongsu",
    service_category_name: "cafe",
    period_label: "latest upload",
    headline: "업로드 매출과 공개 맥락 신호가 함께 관측되었습니다",
    summary: RELIABILITY_NOTE_KO,
    top_cause_candidates: [],
    recommended_actions: [],
    data_freshness: 1,
    generated_at: new Date().toISOString(),
  };
}

// ─── Brief / evidence quality helpers (M7 correctness) ──────────────────────

function normalizeCopy(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").replace(/\.{2,}/g, ".").trim().toLowerCase()
    : "";
}

function sanitizeCautionText(value) {
  if (typeof value !== "string") return value;
  // Collapse repeated periods and de-duplicate the trailing
  // "인과가 확정된 것은 아닙니다." sentence if it appears multiple times.
  let cleaned = value.replace(/\.{2,}/g, ".").replace(/\s+/g, " ").trim();
  const cautionKo = "인과가 확정된 것은 아닙니다";
  const cautionEn = "this does not prove causality";
  for (const phrase of [cautionKo, cautionEn]) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped}\\.?)([\\s.,]*\\1\\.?)+`, "gi");
    cleaned = cleaned.replace(re, "$1");
  }
  return cleaned;
}

function looksMissingMetric(evidence) {
  if (!evidence) return true;
  const value = evidence.metric_value;
  if (value === null || value === undefined) return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  return false;
}

function isZeroRainEvidence(evidence) {
  if (!evidence) return false;
  if (evidence.metric_name !== "rainfall_mm") return false;
  return Number(evidence.metric_value) === 0;
}

// Drop cause-candidate evidence rows that fail quality gates.
function filterEvidenceForQuality(evidenceRows = []) {
  return evidenceRows.filter((row) => {
    if (looksMissingMetric(row)) return false;
    if (isZeroRainEvidence(row)) return false;
    return true;
  });
}

function dedupeCauseCandidates(candidates = []) {
  const seen = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeCopy(candidate.evidence_type ?? candidate.candidate_type ?? "")}::${normalizeCopy(candidate.summary ?? candidate.title ?? "")}`;
    if (!seen.has(key)) seen.set(key, candidate);
  }
  return Array.from(seen.values());
}

function dedupeActionsByFamily(actions = []) {
  const seen = new Map();
  for (const action of actions) {
    const key = `${normalizeCopy(action.action_type ?? action.action_family ?? "")}::${normalizeCopy(action.title ?? "")}`;
    if (!seen.has(key)) {
      seen.set(key, { ...action });
    } else {
      // Merge tied causes when duplicate action templates exist.
      const existing = seen.get(key);
      const tied = new Set([
        ...(existing.tied_cause_candidate_ids ?? (existing.cause_candidate_id ? [existing.cause_candidate_id] : [])),
        ...(action.tied_cause_candidate_ids ?? (action.cause_candidate_id ? [action.cause_candidate_id] : [])),
      ]);
      existing.tied_cause_candidate_ids = Array.from(tied);
    }
  }
  return Array.from(seen.values());
}

function buildAnomaliesFromFacts(storeId) {
  return [{
    anomaly_id: `anomaly_${storeId}_latest`,
    store_id: storeId,
    metric: "net_sales_amount",
    baseline_period: "previous same weekday average",
    compare_period: "latest upload",
    delta_pct: 0,
    anomaly_type: "store_revenue_pattern",
    interpretation_note: "Store-scoped revenue pattern. Not proven causality.",
    detected_at: new Date().toISOString(),
  }];
}

function isDemoStoreRecord(store) {
  return Boolean(store && (
    store.store_type === "demo"
    || store.tenant_type === "demo"
    || store.metadata?.is_demo === true
  ));
}

function demoProfileForStore(store) {
  if (!store) return null;
  const scenario = store.metadata?.demo_scenario;
  return (m6DemoDataset.stores ?? []).find((profile) => (
    profile.demo_scenario === scenario
    || profile.store_name === store.store_name
  )) ?? null;
}

function sanitizeRevenueRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {};
  }
  const allowed = [
    "business_date",
    "channel",
    "gross_sales_amount",
    "net_sales_amount",
    "order_count",
    "cancel_count",
    "cancellation_count",
    "refund_amount",
    "discount_amount",
    "delivery_fee_amount",
    "commission_amount",
    "settlement_amount",
    "payment_card_amount",
    "payment_cash_amount",
    "source_file_type",
    "source_row_number",
    "item_name",
    "item_category",
    "quantity",
  ];
  return Object.fromEntries(allowed.filter((key) => key in row).map((key) => [key, row[key]]));
}

function accepted(value) {
  return { ok: true, value };
}

function rejected(reasonCode, reasonMessage) {
  return { ok: false, reason_code: reasonCode, reason_message: reasonMessage };
}

function prepareRevenueUploadRows(payload = {}) {
  const hasExplicitRows = Array.isArray(payload.daily_rows) || Array.isArray(payload.item_rows);
  if (hasExplicitRows) {
    return {
      dailyRows: Array.isArray(payload.daily_rows) ? payload.daily_rows : [],
      itemRows: Array.isArray(payload.item_rows) ? payload.item_rows : [],
      rejectedRows: [],
      metadata: {},
    };
  }
  const preview = previewRevenueUploadPayload(payload);
  return {
    dailyRows: preview.daily_rows,
    itemRows: preview.item_rows,
    rejectedRows: preview.rejected_rows,
    metadata: {
      parser_type: preview.parser_type,
      parser_source_type: preview.source_type,
      detected_columns: preview.detected_columns,
      proposed_mapping: preview.proposed_mapping,
      xlsx_binary_supported: false,
    },
  };
}

function buildContextBootstrapHint(store = {}) {
  const hasAddressText = Boolean(text(store.address_text));
  const hasBusinessCategory = Boolean(text(store.business_category));
  const missing = [];
  if (!hasAddressText) missing.push("address_text");
  if (!hasBusinessCategory) missing.push("business_category");
  return {
    recommended: missing.length === 0,
    mode: "live",
    reason: BOOTSTRAP_REASON,
    prerequisites: {
      has_address_text: hasAddressText,
      has_business_category: hasBusinessCategory,
    },
    missing_prerequisites: missing,
    note: missing.length === 0
      ? "현재 수집된 데이터만으로 초기 분석을 시작할 수 있습니다."
      : "주소와 업종이 보강되면 자동 맥락데이터 수집을 권장합니다.",
  };
}

function latestBy(rows, key) {
  return rows
    .filter((row) => row?.[key])
    .sort((a, b) => String(b[key]).localeCompare(String(a[key])))[0] ?? null;
}

function addDays(yyyyMmDd, delta) {
  const date = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function percentageDelta(current, previous) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) {
    return null;
  }
  return Math.round(((currentNumber - previousNumber) / previousNumber) * 10000) / 100;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function money(value) {
  const number = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function int(value, fallback = 0) {
  const number = Number(String(value ?? fallback).replace(/,/g, ""));
  return Number.isInteger(number) ? number : Math.trunc(Number.isFinite(number) ? number : fallback);
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}

function normalizeFamily(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("communication")) return "retention_campaign";
  if (normalized.includes("menu")) return "menu_mix_recovery";
  return normalized || "data_quality_check";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "_").toLowerCase() : "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createRevenueOpsSaasStore,
  DEMO_STORE_NAME,
  DEMO_TENANT_NAME,
  RELIABILITY_NOTE_KO,
  RELIABILITY_NOTE_EN,
  BOOTSTRAP_REASON,
  buildContextBootstrapHint,
  prepareRevenueUploadRows,
  normalizeDailyRow,
  normalizeItemRow,
  sanitizeRevenueRow,
  buildSyntheticDailyRows,
  buildSyntheticItemRows,
  parseDate,
  text,
  money,
  int,
  safeObject,
  clone,
  // Brief-correctness helpers (shared by memory + Aurora paths).
  sanitizeCautionText,
  dedupeCauseCandidates,
  dedupeActionsByFamily,
  filterEvidenceForQuality,
  composeBriefFromUploadedFacts,
};

// Standalone composer that the Aurora path can call after it has loaded
// daily facts + cause candidates + evidence + actions for a store.

// ─── V1.2: collector-sourced cause candidates ────────────────────────────
// Pull collector summaries from a stored collector_run and turn completed
// collectors with non-zero observations into real-source cause candidates
// + evidence rows. Failed / observation_count=0 collectors do NOT generate
// cause candidates. Source metadata (collector_id, collector_status,
// observed_period, last_collected_at) is attached so the Cause Evidence
// UI can render the correct source chip without hardcoding.

// Robustly extract the per-collector summaries from a stored collector_run
// row. Aurora's jsonb usually returns objects, but pg can also return JSON
// strings, and different code paths attach the collector array under
// different keys (metadata.collectors, summary.collectors, result_summary,
// raw_summary, payload, or directly on the run). Try each shape in order.
function normalizeCollectorSummariesFromRun(run) {
  if (!run || typeof run !== "object") return [];
  const candidates = [
    parseMaybeJson(run.metadata),
    parseMaybeJson(run.summary),
    parseMaybeJson(run.result_summary),
    parseMaybeJson(run.result),
    parseMaybeJson(run.payload),
    parseMaybeJson(run.raw_summary),
    run, // direct fields like run.collectors
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    if (Array.isArray(candidate.collectors)) {
      return candidate.collectors.filter((c) => c && typeof c === "object");
    }
    // Nested under summary / result_summary inside metadata, etc.
    const nested = parseMaybeJson(candidate.summary) || parseMaybeJson(candidate.result_summary);
    if (nested && Array.isArray(nested.collectors)) {
      return nested.collectors.filter((c) => c && typeof c === "object");
    }
  }
  return [];
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Back-compat alias kept for any internal caller.
function extractCollectorSummariesFromRun(run) {
  return normalizeCollectorSummariesFromRun(run);
}

function buildCollectorSourcedCauseCandidates(collectors, { startDate, endDate } = {}) {
  const promoted = [];
  for (const collector of collectors || []) {
    const status = String(collector.status || "");
    const observationCount = Number(collector.observation_count || 0);
    const isCompleted = status === "completed" || status === "ok";
    if (!isCompleted) continue; // failed / skipped never promotes
    if (observationCount <= 0) continue; // 0 observations never promotes
    const promotedItem = collectorToCauseCandidate(collector, { startDate, endDate });
    if (promotedItem) promoted.push(promotedItem);
  }
  return promoted;
}

function collectorToCauseCandidate(collector, { startDate = null, endDate = null } = {}) {
  const id = String(collector.name || collector.collector_name || "");
  if (!id) return null;
  const causeId = `cause_collector_${id}`;
  const evidenceId = `evi_collector_${id}`;
  const lastCollectedAt = collector.collected_at || collector.freshness || null;
  const observationCount = Number(collector.observation_count || 0);
  const sharedMetadata = {
    collector_id: id,
    collector_status: collector.status,
    observed_period: startDate && endDate ? `${startDate} ~ ${endDate}` : null,
    last_collected_at: lastCollectedAt,
    observation_count: observationCount,
    not_proven_causality: true,
  };
  const baseCandidate = {
    cause_candidate_id: causeId,
    candidate_type: null,
    title: null,
    summary: null,
    confidence: "medium",
    status: "active",
    metric_name: null,
    created_from: "context_collector",
    created_at: lastCollectedAt,
    updated_at: lastCollectedAt,
  };
  const baseEvidence = {
    evidence_id: evidenceId,
    cause_candidate_id: causeId,
    evidence_type: null,
    strength: "medium",
    summary: null,
    source_name: collector.source_name || null,
    source_ref: collector.source_ref || `collector:${id}`,
    metric_name: null,
    metric_value: null,
    metadata: sharedMetadata,
    created_at: lastCollectedAt,
  };
  if (id === "kma_weather") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "kma_weather_context",
        title: "기상청 날씨 맥락",
        summary: "기상청 ASOS 관측치가 매출 변동 구간과 함께 관측되었습니다.",
        metric_name: "weather_observation_count",
      },
      evidence: { ...baseEvidence,
        evidence_type: "weather",
        summary: "기상청 ASOS 관측치가 매출 변동 구간과 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
        metric_name: "weather_observation_count",
        metric_value: observationCount,
        source_name: collector.source_name || "기상청 ASOS",
      },
    };
  }
  if (id === "korean_holiday_calendar") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "calendar_context",
        title: "공휴일/요일/시즌 맥락",
        summary: "공휴일/특일 일정이 매출 기간과 함께 관측되었습니다. 해석에 참고할 수 있습니다.",
        metric_name: "holiday_count",
      },
      evidence: { ...baseEvidence,
        evidence_type: "calendar",
        summary: `공휴일/특일 ${observationCount}건이 매출 기간과 함께 관측되었습니다.`,
        metric_name: "holiday_count",
        metric_value: observationCount,
        source_name: collector.source_name || "Korean Astronomy Holiday API",
      },
    };
  }
  if (id === "local_event_context") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "local_event_context",
        title: "지역 이벤트 맥락",
        summary: "근처 지역 이벤트가 매출 기간과 함께 관측되었습니다. 해석에 참고할 수 있습니다.",
        metric_name: "matched_event_count",
      },
      evidence: { ...baseEvidence,
        evidence_type: "local_event",
        summary: `매칭 지역 이벤트 ${observationCount}건이 매출 기간과 함께 관측되었습니다.`,
        metric_name: "matched_event_count",
        metric_value: observationCount,
        source_name: collector.source_name || "Seoul Open Data local event",
      },
    };
  }
  if (id === "naver_search_trend") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "search_demand_context",
        title: "네이버 업종/메뉴 관심도",
        summary: "카테고리/메뉴 검색 수요가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "naver_search_ratio",
      },
      evidence: { ...baseEvidence,
        evidence_type: "search_demand",
        summary: "카테고리/메뉴 검색 관심도가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "naver_search_ratio",
        metric_value: null,
        source_name: collector.source_name || "Naver DataLab",
      },
    };
  }
  if (id === "seoul_foot_traffic_proxy") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "foot_traffic_drop",
        title: "유동인구 변화 가능성",
        summary: "서울 열린데이터 생활인구 프록시가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "foot_traffic_proxy_delta_pct",
      },
      evidence: { ...baseEvidence,
        evidence_type: "foot_traffic",
        summary: "서울 열린데이터 생활인구 프록시가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "foot_traffic_proxy_delta_pct",
        source_name: collector.source_name || "Seoul Open Data foot traffic",
      },
    };
  }
  if (id === "seoul_commercial_benchmark") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "benchmark_downturn",
        title: "상권 벤치마크 변화 가능성",
        summary: "서울 열린데이터 상권 벤치마크가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "commercial_area_sales_delta_pct",
      },
      evidence: { ...baseEvidence,
        evidence_type: "benchmark",
        summary: "서울 열린데이터 상권 벤치마크가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "commercial_area_sales_delta_pct",
        source_name: collector.source_name || "Seoul Open Data commercial benchmark",
      },
    };
  }
  if (id === "seoul_store_density_proxy" || id === "naver_local_competitor_search") {
    return {
      candidate: { ...baseCandidate,
        candidate_type: "competition_context",
        title: "주변 점포 맥락",
        summary: "주변 동종 점포 신호가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "same_category_store_count",
      },
      evidence: { ...baseEvidence,
        evidence_type: "competition",
        summary: "주변 동종 점포 신호가 매출 변화 기간과 함께 관측되었습니다.",
        metric_name: "same_category_store_count",
        source_name: collector.source_name || (id === "seoul_store_density_proxy" ? "Seoul Open Data store density" : "Naver Local Search"),
      },
    };
  }
  return null;
}

// Aggregate daily facts into one row per business_date. Channel-level rows
// are summed so multi-channel days render as a single chart point and KPI
// totals stay consistent with the chart. Returns rows sorted ascending by
// date with no duplicate dates.
function aggregateDailyFactsByDate(facts) {
  const byDate = new Map();
  for (const row of facts || []) {
    const date = normalizeBusinessDate(row.business_date);
    if (!date) continue;
    const net = Number(row.net_sales_amount || 0);
    const gross = Number(row.gross_sales_amount || 0);
    const orders = Number(row.order_count || 0);
    const existing = byDate.get(date);
    if (existing) {
      existing.net_sales += net;
      existing.gross_sales += gross;
      existing.order_count += orders;
    } else {
      byDate.set(date, { date, net_sales: net, gross_sales: gross, order_count: orders });
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      net_sales: row.net_sales,
      order_count: row.order_count,
    }));
}

function normalizeBusinessDate(value) {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) return "";
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }

    return "";
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    const time = parsed.getTime();
    if (!Number.isFinite(time)) return "";
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function composeBriefFromUploadedFacts({
  storeId,
  store,
  facts,
  causeCandidates = [],
  causeEvidence = [],
  actions = [],
  latestUpload = null,
  latestCollectorRun = null,
  insufficientThresholdDays = 2,
}) {
  const normalizedFacts = [...(facts || [])]
    .map((row) => ({
      ...row,
      business_date: normalizeBusinessDate(row.business_date),
    }))
    .filter((row) => row.business_date);

  const sortedFacts = normalizedFacts.sort((a, b) => a.business_date.localeCompare(b.business_date));
  if (sortedFacts.length === 0) return null;
  const startDate = sortedFacts[0].business_date;
  const endDate = sortedFacts[sortedFacts.length - 1].business_date;
  const periodLabel = `${startDate} ~ ${endDate}`;
  const totalNet = sortedFacts.reduce((sum, row) => sum + Number(row.net_sales_amount || 0), 0);
  const totalOrders = sortedFacts.reduce((sum, row) => sum + Number(row.order_count || 0), 0);
  const uniqueDates = new Set(sortedFacts.map((row) => row.business_date));
  const avgDailyNet = uniqueDates.size ? Math.round(totalNet / uniqueDates.size) : 0;
  // AOV must be total_sales / total_orders, never the average of row AOVs.
  const avgTicket = totalOrders > 0 ? Math.round(totalNet / totalOrders) : 0;
  const insufficient = uniqueDates.size < insufficientThresholdDays;

  // V1.2: promote real collector observations into cause candidates so the
  // brief cites real sources (KMA / 한국천문연구원 특일 API / Seoul Open
  // Data / Naver DataLab) instead of the seed_rule fallback whenever the
  // collector has produced matching observations. Seed candidates of the
  // same evidence_type are then suppressed in the rendered list (state is
  // not mutated — this only affects the brief view).
  const collectorSummaries = extractCollectorSummariesFromRun(latestCollectorRun);
  const promoted = buildCollectorSourcedCauseCandidates(collectorSummaries, { startDate, endDate, totalSales: totalNet });
  const promotedEvidenceTypes = new Set(promoted.map((p) => p.candidate.candidate_type));
  const filteredCauseCandidates = (causeCandidates || []).filter((candidate) => {
    if (candidate.created_from !== "seed_rule") return true;
    if (candidate.candidate_type === "rainy_day_offline_drop" && promotedEvidenceTypes.has("kma_weather_context")) return false;
    return true;
  });
  const causeCandidatesWithCollectors = [
    ...promoted.map((p) => p.candidate),
    ...filteredCauseCandidates,
  ];
  const causeEvidenceWithCollectors = [
    ...promoted.map((p) => p.evidence),
    ...causeEvidence,
  ];

  const evidenceByCause = new Map();
  for (const evi of causeEvidenceWithCollectors) {
    const key = evi.cause_candidate_id;
    if (!evidenceByCause.has(key)) evidenceByCause.set(key, []);
    evidenceByCause.get(key).push(evi);
  }
  const qualityCauses = (causeCandidatesWithCollectors || [])
    .filter((row) => row.status !== "superseded")
    .map((candidate) => {
      const rawEvidence = evidenceByCause.get(candidate.cause_candidate_id) || candidate.evidence || [];
      const sanitizedEvidence = rawEvidence.map((evidence) => ({
        ...evidence,
        summary: sanitizeCautionText(evidence.summary),
      }));
      const qualityEvidence = filterEvidenceForQuality(sanitizedEvidence);
      const fallbackEvidence = qualityEvidence.length > 0
        ? []
        : sanitizedEvidence.slice(0, 1).map((evidence) => ({
          ...evidence,
          strength: evidence.strength || "weak",
          metadata: {
            ...(evidence.metadata && typeof evidence.metadata === "object" && !Array.isArray(evidence.metadata) ? evidence.metadata : {}),
            weak_context_fallback: true,
            metric_value_missing: evidence.metric_value === null || typeof evidence.metric_value === "undefined",
          },
        }));

      return {
        ...candidate,
        evidence: qualityEvidence.length > 0 ? qualityEvidence : fallbackEvidence,
        evidence_quality_fallback: qualityEvidence.length === 0 && fallbackEvidence.length > 0,
      };
    })
    .filter((candidate) => Array.isArray(candidate.evidence) && candidate.evidence.length > 0);

  const dedupedCauses = dedupeCauseCandidates(qualityCauses).map((candidate) => ({
    ...candidate,
    summary: sanitizeCautionText(candidate.summary),
  }));

  const dedupedActions = dedupeActionsByFamily(actions || []).map((action) => ({
    ...action,
    why_this_action: sanitizeCautionText(action.why_this_action),
    risk_note: sanitizeCautionText(action.risk_note),
    description: sanitizeCautionText(action.description),
  }));

  // Aggregate daily facts by business_date so the chart, KPI cards, AOV,
  // recent-vs-previous comparison and CSV export all share the same source.
  // Without this, multi-channel days produce duplicate entries (and the
  // chart paints a zero-spike sawtooth when net_sales is missing on some
  // rows). Channel-level totals are summed; AOV is total_sales / total_orders.
  const dailySeries = aggregateDailyFactsByDate(sortedFacts);

  const headline = insufficient
    ? `${store?.store_name ?? "매장"}: 1일치 매출이 등록되었습니다. 추세 분석을 위해 비교 일자를 더 추가해 주세요.`
    : `${store?.store_name ?? "매장"}: 업로드 매출과 공개 맥락 신호가 함께 관측되었습니다.`;
  const summary = sanitizeCautionText(
    insufficient
      ? "짧은 기간 기준의 초기 분석입니다. 추가 일자가 등록되면 추세와 원인 후보가 갱신됩니다. " + RELIABILITY_NOTE_KO
      : "업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 가능성 높은 원인 후보가 있으나 인과가 확정된 것은 아닙니다. 추가 확인이 필요합니다."
  );

  return {
    brief_id: `brief_${storeId}_${endDate}`,
    store_id: storeId,
    store_name: store?.store_name ?? null,
    trade_area_name: store?.region ?? null,
    service_category_name: store?.business_category ?? null,
    period_label: periodLabel,
    period_start: startDate,
    period_end: endDate,
    headline,
    summary,
    reliability_note: RELIABILITY_NOTE_KO,
    daily_series: dailySeries,
    revenue_summary: {
      net_sales_total: totalNet,
      order_count_total: totalOrders,
      avg_daily_net_sales: avgDailyNet,
      avg_ticket: avgTicket,
      days_in_period: sortedFacts.length,
      latest_upload_id: latestUpload?.upload_id ?? null,
      not_proven_causality: true,
    },
    top_cause_candidates: dedupedCauses.slice(0, 4),
    recommended_actions: dedupedActions.slice(0, 6),
    insufficient_data: insufficient,
    data_freshness: 1,
    generated_at: new Date().toISOString(),
  };
}
