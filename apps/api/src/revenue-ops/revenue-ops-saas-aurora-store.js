const fs = require("node:fs");
const path = require("node:path");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require("pg");

const exportData = require("./data/revenue_ops_export.json");
const { parseSecretJson } = require("./aurora-action-status-store");
const { getJwtClaimsFromEvent, normalizeClaims } = require("./revenue-ops-auth");
const {
  DEMO_STORE_NAME,
  DEMO_TENANT_NAME,
  RELIABILITY_NOTE_KO,
  RELIABILITY_NOTE_EN,
  normalizeDailyRow,
  normalizeItemRow,
  sanitizeRevenueRow,
  buildSyntheticDailyRows,
  buildSyntheticItemRows,
  text,
  safeObject,
  clone,
} = require("./revenue-ops-saas-store");
const { planStorePublicContextCollection } = require("./context-collectors");
const { previewRevenueUploadPayload } = require("./revenue-upload-parsers");
const { VALID_ACTION_STATUSES } = require("./revenue-ops-store");

const ROLE_RANK = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

async function getSecretStringFromArn({ secretArn, region }) {
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  return result.SecretString;
}

function createAuroraRevenueOpsSaasStore({
  env = process.env,
  data = exportData,
  getSecretString = getSecretStringFromArn,
  poolFactory = (config) => new Pool(config),
} = {}) {
  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "ap-northeast-2";
  let poolPromise;
  let schemaReady = false;

  async function getPool() {
    if (!poolPromise) {
      poolPromise = (async () => {
        if (env.AURORA_DATABASE_URL || env.DATABASE_URL) {
          return poolFactory({
            connectionString: env.AURORA_DATABASE_URL || env.DATABASE_URL,
            ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 10000,
            max: 2,
          });
        }

        if (!env.AURORA_SECRET_ARN || !env.AURORA_CLUSTER_ENDPOINT) {
          throw new Error("Aurora SaaS store requires AURORA_DATABASE_URL/DATABASE_URL or AURORA_SECRET_ARN and AURORA_CLUSTER_ENDPOINT");
        }

        const secretString = await getSecretString({ secretArn: env.AURORA_SECRET_ARN, region });
        const connection = parseSecretJson(secretString, {
          host: env.AURORA_CLUSTER_ENDPOINT,
          port: env.AURORA_PORT,
          database: env.AURORA_DATABASE_NAME,
        });

        return poolFactory({
          host: connection.host,
          port: connection.port,
          user: connection.username,
          password: connection.password,
          database: connection.database,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 10000,
          max: 2,
        });
      })();
    }
    return poolPromise;
  }

  async function ensureSchema() {
    if (schemaReady) return;
    const pool = await getPool();
    await pool.query(loadStep3SchemaSql());
    schemaReady = true;
  }

  async function query(sql, params = []) {
    await ensureSchema();
    const pool = await getPool();
    return pool.query(sql, params);
  }

  async function withTransaction(fn) {
    await ensureSchema();
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function resolveAppUserFromJwtClaims(claims) {
    const normalized = normalizeClaims(claims);
    const result = await query(
      `
        INSERT INTO app_users (cognito_sub, email, display_name, last_login_at, updated_at)
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (cognito_sub)
        DO UPDATE SET
          email = COALESCE(EXCLUDED.email, app_users.email),
          display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
          last_login_at = now(),
          updated_at = now()
        RETURNING app_user_id, cognito_sub, email, display_name, status, last_login_at, created_at, updated_at
      `,
      [normalized.cognito_sub, normalized.email, normalized.display_name],
    );
    return result.rows[0];
  }

  async function requireAuthenticatedAppUser(event) {
    return resolveAppUserFromJwtClaims(event?.authClaims ?? getJwtClaimsFromEvent(event) ?? event);
  }

  async function requireStoreAccess(appUserId, storeId, minimumRole = "viewer") {
    const result = await query(
      `
        SELECT store_id, app_user_id, role, status, created_at, updated_at
        FROM store_members
        WHERE store_id = $1 AND app_user_id = $2 AND status = 'active'
        LIMIT 1
      `,
      [storeId, appUserId],
    );
    const member = result.rows[0] ?? null;
    if (!member) return null;
    if ((ROLE_RANK[member.role] ?? 0) < (ROLE_RANK[minimumRole] ?? 0)) return null;
    return member;
  }

  async function listStoresForUser(appUserId) {
    let result = await query(
      `
        SELECT s.*, sm.role AS member_role, t.tenant_name, t.tenant_type
        FROM store_members sm
        JOIN stores s ON s.store_id = sm.store_id
        JOIN tenants t ON t.tenant_id = s.tenant_id
        WHERE sm.app_user_id = $1
          AND sm.status = 'active'
          AND s.status = 'active'
        ORDER BY s.created_at ASC
      `,
      [appUserId],
    );
    if (result.rows.length === 0) {
      await seedDemoStoreForUser(appUserId);
      result = await query(
        `
          SELECT s.*, sm.role AS member_role, t.tenant_name, t.tenant_type
          FROM store_members sm
          JOIN stores s ON s.store_id = sm.store_id
          JOIN tenants t ON t.tenant_id = s.tenant_id
          WHERE sm.app_user_id = $1
            AND sm.status = 'active'
            AND s.status = 'active'
          ORDER BY s.created_at ASC
        `,
        [appUserId],
      );
    }
    return result.rows;
  }

  async function createStoreForUser(appUserId, payload = {}) {
    const storeName = text(payload.store_name);
    if (!storeName) {
      const err = new Error("store_name is required");
      err.code = "invalid_body";
      throw err;
    }

    return withTransaction(async (client) => {
      const tenantResult = await client.query(
        `
          INSERT INTO tenants (tenant_name, tenant_type, created_by)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [text(payload.tenant_name) || `${storeName} Tenant`, text(payload.tenant_type) || "merchant", appUserId],
      );
      const tenant = tenantResult.rows[0];
      const storeResult = await client.query(
        `
          INSERT INTO stores (
            tenant_id, store_name, store_type, business_category, region,
            address_text, timezone, metadata, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
          RETURNING *
        `,
        [
          tenant.tenant_id,
          storeName,
          text(payload.store_type) || "single_store",
          text(payload.business_category) || null,
          text(payload.region) || null,
          text(payload.address_text) || null,
          text(payload.timezone) || "Asia/Seoul",
          JSON.stringify(safeObject(payload.metadata)),
          appUserId,
        ],
      );
      const store = storeResult.rows[0];
      await client.query(
        "INSERT INTO tenant_members (tenant_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (tenant_id, app_user_id) DO NOTHING",
        [tenant.tenant_id, appUserId],
      );
      await client.query(
        "INSERT INTO store_members (store_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (store_id, app_user_id) DO NOTHING",
        [store.store_id, appUserId],
      );
      await seedStoreLocation(client, store);
      await createOutboxEventWithClient(client, {
        event_type: "store.created",
        aggregate_type: "store",
        aggregate_id: store.store_id,
        tenant_id: tenant.tenant_id,
        store_id: store.store_id,
        idempotency_key: `store.created:${store.store_id}`,
        payload: { store_name: store.store_name },
      });
      return {
        ...store,
        member_role: "owner",
        tenant_name: tenant.tenant_name,
        tenant_type: tenant.tenant_type,
      };
    });
  }

  async function seedDemoStoreForUser(appUserId) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `
          SELECT s.*
          FROM store_members sm
          JOIN stores s ON s.store_id = sm.store_id
          WHERE sm.app_user_id = $1 AND s.store_name = $2 AND s.store_type = 'demo'
          LIMIT 1
        `,
        [appUserId, DEMO_STORE_NAME],
      );
      if (existing.rows[0]) {
        return existing.rows[0];
      }

      const tenantResult = await client.query(
        `
          INSERT INTO tenants (tenant_name, tenant_type, created_by)
          VALUES ($1, 'demo', $2)
          RETURNING *
        `,
        [DEMO_TENANT_NAME, appUserId],
      );
      const tenant = tenantResult.rows[0];
      const storeResult = await client.query(
        `
          INSERT INTO stores (
            tenant_id, store_name, store_type, business_category, region,
            address_text, timezone, metadata, created_by
          )
          VALUES ($1, $2, 'demo', 'cafe', 'Seoul Seongsu', $3, 'Asia/Seoul', $4::jsonb, $5)
          RETURNING *
        `,
        [
          tenant.tenant_id,
          DEMO_STORE_NAME,
          "서울 성동구 성수동 일대",
          JSON.stringify({
            synthetic_notice: "Realistic synthetic POS data calibrated by public commercial-district benchmark assumptions. Not real individual store revenue.",
          }),
          appUserId,
        ],
      );
      const store = storeResult.rows[0];
      await client.query(
        "INSERT INTO tenant_members (tenant_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (tenant_id, app_user_id) DO NOTHING",
        [tenant.tenant_id, appUserId],
      );
      await client.query(
        "INSERT INTO store_members (store_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (store_id, app_user_id) DO NOTHING",
        [store.store_id, appUserId],
      );
      await seedStoreLocation(client, store);
      await seedStoreContentWithClient(client, store, appUserId);
      return store;
    });
  }

  async function seedStoreLocation(client, store) {
    await client.query(
      `
        INSERT INTO store_locations (
          store_id, address_text, latitude, longitude, region, administrative_dong,
          legal_dong, geocode_provider, geocode_status, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (store_id)
        DO UPDATE SET
          address_text = EXCLUDED.address_text,
          region = EXCLUDED.region,
          updated_at = now()
      `,
      [
        store.store_id,
        store.address_text,
        store.store_type === "demo" ? 37.5446 : null,
        store.store_type === "demo" ? 127.0557 : null,
        store.region,
        store.store_type === "demo" ? "Seongsu-dong" : null,
        store.store_type === "demo" ? "Seongsu-dong" : null,
        store.store_type === "demo" ? "manual_seed" : null,
        store.store_type === "demo" ? "manual_seed" : "pending",
        JSON.stringify({ exact_location_claim: false }),
      ],
    );
  }

  async function seedStoreContentWithClient(client, store, appUserId) {
    await seedRevenueFactsWithClient(client, store, appUserId);
    await seedContextWithClient(client, store);
    await seedCauseActionLoopWithClient(client, store);
  }

  async function seedRevenueFactsWithClient(client, store, appUserId) {
    const exists = await client.query("SELECT 1 FROM revenue_uploads WHERE store_id = $1 AND source_type = 'synthetic_seed' LIMIT 1", [store.store_id]);
    if (exists.rows[0]) return;
    const dailyRows = buildSyntheticDailyRows();
    const itemRows = buildSyntheticItemRows(dailyRows);
    const upload = await client.query(
      `
        INSERT INTO revenue_uploads (
          store_id, uploaded_by, source_type, original_filename, file_type,
          status, row_count, accepted_count, rejected_count, metadata
        )
        VALUES ($1, $2, 'synthetic_seed', 'seongsu_cafe_daily_revenue.csv', 'csv',
          'accepted', $3, $3, 0, $4::jsonb)
        RETURNING upload_id
      `,
      [
        store.store_id,
        appUserId,
        dailyRows.length + itemRows.length,
        JSON.stringify({ synthetic_notice: "Not real individual store revenue." }),
      ],
    );
    const uploadId = upload.rows[0].upload_id;
    for (const row of dailyRows) {
      await client.query(
        `
          INSERT INTO revenue_daily_facts (
            store_id, business_date, channel, gross_sales_amount, net_sales_amount,
            order_count, cancel_count, refund_amount, discount_amount,
            payment_card_amount, payment_cash_amount, source_upload_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (store_id, business_date, channel, source_upload_id) DO NOTHING
        `,
        [
          store.store_id,
          row.business_date,
          row.channel,
          row.gross_sales_amount,
          row.net_sales_amount,
          row.order_count,
          row.cancel_count,
          row.refund_amount,
          row.discount_amount,
          row.payment_card_amount,
          row.payment_cash_amount,
          uploadId,
        ],
      );
    }
    for (const row of itemRows) {
      await client.query(
        `
          INSERT INTO revenue_item_facts (
            store_id, business_date, channel, item_name, item_category, quantity,
            gross_sales_amount, discount_amount, net_sales_amount, source_upload_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          store.store_id,
          row.business_date,
          row.channel,
          row.item_name,
          row.item_category,
          row.quantity,
          row.gross_sales_amount,
          row.discount_amount,
          row.net_sales_amount,
          uploadId,
        ],
      );
    }
  }

  async function seedContextWithClient(client, store) {
    const sources = [
      ["manual_seed_weather", "Manual seed weather context", "weather"],
      ["manual_seed_commercial_benchmark", "Manual seed commercial district benchmark", "benchmark"],
      ["manual_seed_foot_traffic", "Manual seed foot traffic proxy", "foot_traffic"],
    ];
    for (const source of sources) {
      await client.query(
        `
          INSERT INTO context_sources (source_id, source_name, source_type, provider, attribution, refresh_granularity)
          VALUES ($1, $2, $3, 'manual_seed', 'Synthetic public context seed', 'seed')
          ON CONFLICT (source_id) DO NOTHING
        `,
        source,
      );
    }
    const observations = [
      ["manual_seed_weather", "2026-04-16", "weather", "rainfall_mm", 38, "mm", "비 오는 날 오프라인 매출 하락 신호와 함께 관측되었습니다"],
      ["manual_seed_foot_traffic", "2026-04-16", "foot_traffic", "foot_traffic_proxy_delta_pct", -14, "pct", "유동인구 프록시 하락이 함께 관측되었습니다"],
      ["manual_seed_commercial_benchmark", "2026-04-17", "benchmark", "commercial_area_sales_delta_pct", -8, "pct", "상권 벤치마크 약세가 함께 관측되었습니다"],
    ];
    for (const observation of observations) {
      const exists = await client.query(
        `
          SELECT 1 FROM context_observations
          WHERE store_id = $1 AND observation_date = $2 AND context_type = $3 AND metric_name = $4
          LIMIT 1
        `,
        [store.store_id, observation[1], observation[2], observation[3]],
      );
      if (exists.rows[0]) continue;
      const inserted = await client.query(
        `
          INSERT INTO context_observations (
            source_id, store_id, observation_date, context_type, metric_name,
            metric_value, metric_unit, label, region
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING observation_id
        `,
        [observation[0], store.store_id, observation[1], observation[2], observation[3], observation[4], observation[5], observation[6], store.region],
      );
      await client.query(
        "INSERT INTO store_context_links (store_id, observation_id, link_type, strength) VALUES ($1, $2, 'manual_seed', 'medium') ON CONFLICT DO NOTHING",
        [store.store_id, inserted.rows[0].observation_id],
      );
    }
    await client.query(
      `
        INSERT INTO public_revenue_benchmarks (
          source_id, region, business_category, period_start, period_end,
          sales_amount, transaction_count, avg_transaction_value, metadata
        )
        SELECT 'manual_seed_commercial_benchmark', $1, $2, '2026-04-01', '2026-04-30',
          148000000, 14800, 10000, '{"exact_official_area_code": false}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM public_revenue_benchmarks
          WHERE region = $1 AND business_category = $2 AND period_start = '2026-04-01'
        )
      `,
      [store.region, store.business_category],
    );
    await client.query(
      `
        INSERT INTO commercial_area_mappings (
          store_id, commercial_area_name, administrative_dong, business_category,
          mapping_method, confidence, metadata
        )
        VALUES ($1, 'Seongsu commercial district seed label', 'Seongsu-dong', $2,
          'manual_seed', 'medium', '{"official_code_verified": false}'::jsonb)
        ON CONFLICT DO NOTHING
      `,
      [store.store_id, store.business_category],
    );
    await client.query(
      `
        INSERT INTO nearby_store_snapshots (
          store_id, snapshot_date, radius_m, business_category,
          same_category_store_count, total_store_count, source_id, metadata
        )
        SELECT $1, '2026-04-18', 500, $2, 61, 228, 'manual_seed_commercial_benchmark',
          '{"source_mode": "manual_seed", "exact_competitor_locations": false}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM nearby_store_snapshots WHERE store_id = $1 AND snapshot_date = '2026-04-18'
        )
      `,
      [store.store_id, store.business_category],
    );
  }

  async function seedCauseActionLoopWithClient(client, store) {
    const exists = await client.query("SELECT 1 FROM cause_candidates WHERE store_id = $1 LIMIT 1", [store.store_id]);
    if (exists.rows[0]) return;
    const cause = await client.query(
      `
        INSERT INTO cause_candidates (
          store_id, candidate_type, title, summary, confidence, metric_name,
          baseline_start, baseline_end, compare_start, compare_end,
          observed_delta_pct, created_from
        )
        VALUES
          ($1, 'rainy_day_offline_drop', '비 오는 날 오프라인 주문 하락 가능성',
           '비 오는 날과 오프라인 주문 하락이 함께 관측되었습니다. 인과가 확정된 것은 아니며 추가 확인이 필요합니다.',
           'medium', 'net_sales_amount', '2026-03-16', '2026-04-14', '2026-04-15', '2026-04-21', -17.6, 'seed_rule')
        RETURNING cause_candidate_id
      `,
      [store.store_id],
    );
    const causeId = cause.rows[0].cause_candidate_id;
    await client.query(
      `
        INSERT INTO cause_candidate_evidence (
          cause_candidate_id, evidence_type, strength, summary, source_name,
          source_ref, metric_name, metric_value, metadata
        )
        VALUES ($1, 'weather', 'medium',
          '2026-04-16 강수량 38mm와 오프라인 매출 하락이 함께 관측되었습니다.',
          'Manual seed weather context', 'manual_seed_weather', 'rainfall_mm', 38,
          '{"not_proven_causality": true}'::jsonb)
      `,
      [causeId],
    );
    const actions = [
      ["rainy_day_delivery_boost", "비 오는 날 배달/포장 세트 메뉴를 테스트하세요", "비 예보가 있는 날에 커피+디저트 포장 세트를 작게 테스트합니다."],
      ["bundle_attach_rate_recovery", "커피+디저트 세트 구성을 테스트하세요", "디저트 결합률 하락 구간에 맞춰 소금빵/휘낭시에 세트 구성을 테스트합니다."],
    ];
    for (const action of actions) {
      const dedupeKey = `${store.store_id}:${action[0]}:${causeId}:${action[1]}`;
      await client.query(
        `
          INSERT INTO action_planner_items (
            store_id, cause_candidate_id, action_family, dedupe_key, title,
            description, why_this_action, expected_effect, risk_note,
            difficulty, outcome_summary
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'medium','결과 추적 대기 중')
          ON CONFLICT (store_id, dedupe_key) DO NOTHING
        `,
        [
          store.store_id,
          causeId,
          action[0],
          dedupeKey,
          action[1],
          action[2],
          "가능성 높은 원인 후보에 대한 근거 기반 제안입니다. 인과가 확정된 것은 아닙니다.",
          "다음 측정 기간에 주문수와 객단가 변화를 관측합니다.",
          "효과가 보장되지 않으며 추가 확인이 필요합니다.",
        ],
      );
    }
  }

  async function getBriefsForStore(storeId) {
    const store = await getStore(storeId);
    const latest = await query(
      "SELECT max(business_date) AS latest_date, count(*)::int AS day_count FROM revenue_daily_facts WHERE store_id = $1",
      [storeId],
    );
    const freshness = latest.rows[0]?.latest_date ? 0.92 : 0.5;
    return (data.briefs ?? []).slice(0, 1).map((brief) => ({
      ...brief,
      store_id: storeId,
      store_name: store?.store_name ?? DEMO_STORE_NAME,
      trade_area_name: store?.region ?? brief.trade_area_name,
      service_category_name: store?.business_category ?? brief.service_category_name,
      headline: `${store?.store_name ?? DEMO_STORE_NAME}: 매출 변화와 공개 맥락 신호가 함께 관측되었습니다`,
      summary: RELIABILITY_NOTE_KO,
      data_freshness: freshness,
      latest_revenue_date: latest.rows[0]?.latest_date ?? null,
      generated_at: new Date().toISOString(),
    }));
  }

  async function getAnomaliesForStore(storeId) {
    const store = await getStore(storeId);
    const result = await query(
      `
        SELECT
          count(*)::int AS day_count,
          avg(net_sales_amount)::numeric AS avg_net_sales,
          min(net_sales_amount)::numeric AS min_net_sales,
          max(net_sales_amount)::numeric AS max_net_sales
        FROM revenue_daily_facts
        WHERE store_id = $1
      `,
      [storeId],
    );
    const row = result.rows[0] ?? {};
    const delta = row.avg_net_sales && row.min_net_sales
      ? Math.round(((Number(row.min_net_sales) - Number(row.avg_net_sales)) / Number(row.avg_net_sales)) * 10000) / 100
      : 0;
    return [{
      anomaly_id: `aurora_${storeId}_net_sales`,
      store_id: storeId,
      trade_area_name: store?.region ?? "store",
      service_category_name: store?.business_category ?? "merchant",
      metric: "revenue_amount",
      baseline_period: "uploaded revenue facts",
      compare_period: "lowest observed day",
      baseline_value: Number(row.avg_net_sales ?? 0),
      actual_value: Number(row.min_net_sales ?? 0),
      delta_pct: delta,
      severity_score: Math.abs(delta) >= 15 ? 2 : 1,
      anomaly_type: "store_revenue_pattern",
      interpretation_note: "Revenue change pattern only. It is not proven causality.",
      detected_at: new Date().toISOString(),
    }];
  }

  async function getActionsForStore(storeId) {
    const result = await query(
      `
        SELECT
          a.*,
          c.title AS cause_title,
          c.summary AS cause_summary,
          c.confidence AS cause_confidence,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'evidence_id', e.evidence_id,
              'evidence_type', e.evidence_type,
              'strength', e.strength,
              'summary', e.summary,
              'source_name', e.source_name,
              'source_ref', e.source_ref,
              'metric_name', e.metric_name,
              'metric_value', e.metric_value
            )) FILTER (WHERE e.evidence_id IS NOT NULL),
            '[]'
          ) AS evidence_snippets,
          (
            SELECT row_to_json(o)
            FROM action_outcome_snapshots o
            WHERE o.action_id = a.action_id
            ORDER BY o.created_at DESC
            LIMIT 1
          ) AS outcome_tracking
        FROM action_planner_items a
        LEFT JOIN cause_candidates c ON c.cause_candidate_id = a.cause_candidate_id
        LEFT JOIN cause_candidate_evidence e ON e.cause_candidate_id = c.cause_candidate_id
        WHERE a.store_id = $1
        GROUP BY a.action_id, c.cause_candidate_id
        ORDER BY a.updated_at DESC
      `,
      [storeId],
    );
    return result.rows.map((row) => mapActionRow(row));
  }

  async function updateActionStatusForStore({ appUserId, storeId, actionId, status, planned_start_date, planned_end_date }) {
    if (!VALID_ACTION_STATUSES.includes(status)) {
      const err = new Error(`Invalid status '${status}'. Valid: ${VALID_ACTION_STATUSES.join(", ")}`);
      err.code = "invalid_status";
      throw err;
    }
    return withTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE action_planner_items
          SET
            status = $1,
            planned_start_date = COALESCE($2, planned_start_date),
            planned_end_date = COALESCE($3, planned_end_date),
            completed_at = CASE WHEN $1 = 'done' THEN COALESCE(completed_at, now()) ELSE completed_at END,
            status_updated_by = $4,
            updated_at = now()
          WHERE store_id = $5 AND action_id = $6
          RETURNING *
        `,
        [status, planned_start_date || null, planned_end_date || null, appUserId, storeId, actionId],
      );
      const action = result.rows[0];
      if (!action) return null;
      if (status === "done") {
        await client.query(
          `
            INSERT INTO action_outcome_snapshots (action_id, store_id, metric_name, summary)
            SELECT $1, $2, 'net_sales_amount', '결과 추적 대기 중. 실행 효과를 단정하지 않습니다.'
            WHERE NOT EXISTS (
              SELECT 1 FROM action_outcome_snapshots WHERE action_id = $1
            )
          `,
          [actionId, storeId],
        );
      }
      await createOutboxEventWithClient(client, {
        event_type: "action.status.changed",
        aggregate_type: "action",
        aggregate_id: actionId,
        store_id: storeId,
        idempotency_key: `action.status.changed:${storeId}:${actionId}:${status}:${Date.now()}`,
        payload: { action_id: actionId, status, not_proven_causality: true },
      });
      const mapped = await getActionByIdWithClient(client, storeId, actionId);
      return mapped;
    });
  }

  async function evaluateActionOutcome(actionId) {
    const action = await one("SELECT store_id FROM action_planner_items WHERE action_id = $1", [actionId]);
    if (!action) return null;
    return buildActionOutcomeForStore(action.store_id, actionId);
  }

  async function buildActionOutcomeForStore(storeId, actionId) {
    const action = await one(
      "SELECT action_id FROM action_planner_items WHERE store_id = $1 AND action_id = $2",
      [storeId, actionId],
    );
    if (!action) return null;
    const outcome = await one(
      "SELECT * FROM action_outcome_snapshots WHERE store_id = $1 AND action_id = $2 ORDER BY created_at DESC LIMIT 1",
      [storeId, actionId],
    );
    return outcome ?? {
      action_id: actionId,
      store_id: storeId,
      metric_name: "net_sales_amount",
      summary: "결과 추적 대기 중",
      summary_en: "Waiting for result window",
      not_proven_causality: true,
    };
  }

  async function ingestRevenueUpload({ appUserId, storeId, payload = {} }) {
    const dailyRows = Array.isArray(payload.daily_rows) ? payload.daily_rows : [];
    const itemRows = Array.isArray(payload.item_rows) ? payload.item_rows : [];
    const rows = [
      ...dailyRows.map((row, index) => ({ kind: "daily", row, index })),
      ...itemRows.map((row, index) => ({ kind: "item", row, index })),
    ];
    if (rows.length === 0) {
      const err = new Error("daily_rows or item_rows is required");
      err.code = "invalid_body";
      throw err;
    }
    return withTransaction(async (client) => {
      const uploadResult = await client.query(
        `
          INSERT INTO revenue_uploads (
            store_id, uploaded_by, source_type, original_filename, file_type,
            status, row_count, metadata
          )
          VALUES ($1,$2,$3,$4,$5,'uploaded',$6,$7::jsonb)
          RETURNING *
        `,
        [
          storeId,
          appUserId,
          text(payload.source_type) || "manual_template",
          text(payload.original_filename) || null,
          text(payload.file_type) || "json",
          rows.length,
          JSON.stringify(safeObject(payload.metadata)),
        ],
      );
      const upload = uploadResult.rows[0];
      let acceptedCount = 0;
      let rejectedCount = 0;
      const rejectedRows = [];
      for (const row of rows) {
        await client.query(
          "INSERT INTO revenue_upload_raw_rows (upload_id, row_number, row_payload) VALUES ($1, $2, $3::jsonb)",
          [upload.upload_id, row.index + 1, JSON.stringify(sanitizeRevenueRow(row.row))],
        );
        const normalized = row.kind === "daily" ? normalizeDailyRow(row.row) : normalizeItemRow(row.row);
        if (!normalized.ok) {
          rejectedCount += 1;
          const rejected = await client.query(
            `
              INSERT INTO revenue_upload_rejected_rows (
                upload_id, row_number, reason_code, reason_message, raw_row_preview
              )
              VALUES ($1,$2,$3,$4,$5::jsonb)
              RETURNING *
            `,
            [upload.upload_id, row.index + 1, normalized.reason_code, normalized.reason_message, JSON.stringify(sanitizeRevenueRow(row.row))],
          );
          rejectedRows.push(rejected.rows[0]);
          continue;
        }
        acceptedCount += 1;
        if (row.kind === "daily") {
          const value = normalized.value;
          await client.query(
            `
              INSERT INTO revenue_daily_facts (
                store_id, business_date, channel, gross_sales_amount, net_sales_amount,
                order_count, cancel_count, refund_amount, discount_amount,
                payment_card_amount, payment_cash_amount, source_upload_id
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
              ON CONFLICT (store_id, business_date, channel, source_upload_id) DO NOTHING
            `,
            [storeId, value.business_date, value.channel, value.gross_sales_amount, value.net_sales_amount, value.order_count, value.cancel_count, value.refund_amount, value.discount_amount, value.payment_card_amount, value.payment_cash_amount, upload.upload_id],
          );
        } else {
          const value = normalized.value;
          await client.query(
            `
              INSERT INTO revenue_item_facts (
                store_id, business_date, channel, item_name, item_category, quantity,
                gross_sales_amount, discount_amount, net_sales_amount, source_upload_id
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [storeId, value.business_date, value.channel, value.item_name, value.item_category, value.quantity, value.gross_sales_amount, value.discount_amount, value.net_sales_amount, upload.upload_id],
          );
        }
      }
      const status = rejectedCount === 0 ? "accepted" : acceptedCount > 0 ? "partially_accepted" : "failed";
      const updated = await client.query(
        `
          UPDATE revenue_uploads
          SET status = $1, accepted_count = $2, rejected_count = $3, updated_at = now()
          WHERE upload_id = $4
          RETURNING *
        `,
        [status, acceptedCount, rejectedCount, upload.upload_id],
      );
      await createOutboxEventWithClient(client, {
        event_type: acceptedCount > 0 ? "revenue.upload.accepted" : "revenue.upload.failed",
        aggregate_type: "revenue_upload",
        aggregate_id: upload.upload_id,
        store_id: storeId,
        idempotency_key: `revenue.upload:${upload.upload_id}`,
        payload: { accepted_count: acceptedCount, rejected_count: rejectedCount },
      });
      return {
        upload: updated.rows[0],
        accepted_count: acceptedCount,
        rejected_count: rejectedCount,
        rejected_rows: rejectedRows,
      };
    });
  }

  async function previewRevenueUpload(payload = {}) {
    return previewRevenueUploadPayload(payload);
  }

  async function listRevenueUploadsForStore(storeId) {
    const result = await query(
      "SELECT * FROM revenue_uploads WHERE store_id = $1 ORDER BY created_at DESC",
      [storeId],
    );
    return result.rows;
  }

  async function listRejectedRowsForUpload(storeId, uploadId) {
    const exists = await query("SELECT 1 FROM revenue_uploads WHERE store_id = $1 AND upload_id = $2", [storeId, uploadId]);
    if (!exists.rows[0]) return null;
    const result = await query(
      "SELECT * FROM revenue_upload_rejected_rows WHERE upload_id = $1 ORDER BY row_number ASC",
      [uploadId],
    );
    return result.rows;
  }

  async function getRejectedRowsForUpload(storeId, uploadId) {
    return listRejectedRowsForUpload(storeId, uploadId);
  }

  async function reprocessRevenueUpload(storeId, uploadId) {
    const uploads = await query("SELECT * FROM revenue_uploads WHERE store_id = $1 AND upload_id = $2", [storeId, uploadId]);
    if (!uploads.rows[0]) return null;
    const jobRun = await createJobRun({
      job_type: "upload_parse",
      target_kind: "upload",
      target_id: uploadId,
      store_id: storeId,
      status: "skipped",
      result_summary: {
        message: "Reprocess skeleton recorded. No destructive rewrite was performed.",
      },
    });
    return { job_run: jobRun, upload: uploads.rows[0] };
  }

  async function getContextForStore(storeId) {
    const result = await query(
      `
        SELECT co.*, row_to_json(cs) AS source
        FROM context_observations co
        LEFT JOIN context_sources cs ON cs.source_id = co.source_id
        WHERE co.store_id = $1
        ORDER BY co.observation_date DESC NULLS LAST, co.created_at DESC
      `,
      [storeId],
    );
    const benchmarks = await query("SELECT * FROM public_revenue_benchmarks ORDER BY fetched_at DESC LIMIT 10");
    const nearby = await query("SELECT * FROM nearby_store_snapshots WHERE store_id = $1 ORDER BY snapshot_date DESC", [storeId]);
    const mappings = await query("SELECT * FROM commercial_area_mappings WHERE store_id = $1 ORDER BY created_at DESC", [storeId]);
    return [{
      store_id: storeId,
      context_observations: result.rows,
      benchmarks: benchmarks.rows,
      nearby_store_snapshots: nearby.rows,
      commercial_area_mappings: mappings.rows,
      reliability_note: RELIABILITY_NOTE_KO,
      reliability_note_en: RELIABILITY_NOTE_EN,
    }];
  }

  async function collectContextForStore(storeId, { mode = "seed" } = {}) {
    return withTransaction(async (client) => {
      const collectionPlan = planStorePublicContextCollection({ mode, env });
      const job = await createJobRunWithClient(client, {
        job_type: "context_collect",
        target_kind: "store",
        target_id: storeId,
        store_id: storeId,
        status: "running",
        started_at: new Date(),
        input_payload: { mode, resolved_mode: collectionPlan.resolved_mode },
      });
      const store = await getStoreWithClient(client, storeId);
      await seedContextWithClient(client, store);
      const collector = await client.query(
        `
          INSERT INTO collector_runs (
            collector_name, status, target_store_id, started_at, completed_at, metadata
          )
          VALUES ('collectStorePublicContext', 'completed', $1, now(), now(), $2::jsonb)
          RETURNING *
        `,
        [storeId, JSON.stringify({
          mode,
          resolved_mode: collectionPlan.resolved_mode,
          collectors: collectionPlan.collectors,
          external_api_keys_required: false,
          skipped_live_collectors_without_keys: collectionPlan.resolved_mode !== "live",
        })],
      );
      const completed = await updateJobRunWithClient(client, job.job_run_id, {
        status: "completed",
        completed_at: new Date(),
        result_summary: { collector_run_id: collector.rows[0].collector_run_id },
      });
      return {
        collector_run: collector.rows[0],
        job_run: completed,
        summary: {
          context_observation_count: await scalarCount(client, "context_observations", "store_id", storeId),
          collector_plan: collectionPlan,
        },
      };
    });
  }

  async function getPipelineMetaForStore(storeId) {
    const latestUpload = await one("SELECT * FROM revenue_uploads WHERE store_id = $1 ORDER BY created_at DESC LIMIT 1", [storeId]);
    const latestContext = await one("SELECT * FROM context_observations WHERE store_id = $1 ORDER BY fetched_at DESC LIMIT 1", [storeId]);
    const latestBenchmark = await one("SELECT * FROM public_revenue_benchmarks ORDER BY fetched_at DESC LIMIT 1");
    const latestCollectorRun = await one("SELECT * FROM collector_runs WHERE target_store_id = $1 ORDER BY created_at DESC LIMIT 1", [storeId]);
    const latestMartBuild = await one("SELECT * FROM mart_build_runs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 1", [storeId]);
    return {
      store_id: storeId,
      latest_revenue_upload: latestUpload,
      latest_context_observation: latestContext,
      latest_public_benchmark_period: latestBenchmark ? {
        period_start: latestBenchmark.period_start,
        period_end: latestBenchmark.period_end,
        source_id: latestBenchmark.source_id,
      } : null,
      latest_collector_run: latestCollectorRun,
      latest_mart_build: latestMartBuild,
      context_freshness_note: latestContext
        ? "공개 맥락 데이터가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다."
        : "공개 맥락 데이터가 아직 충분하지 않습니다.",
      data_reliability_note: RELIABILITY_NOTE_KO,
      data_reliability_note_en: RELIABILITY_NOTE_EN,
      runtime_backend: "aurora",
    };
  }

  async function getCauseCandidatesForStore(storeId) {
    const result = await query(
      `
        SELECT c.*,
          COALESCE(json_agg(e ORDER BY e.created_at) FILTER (WHERE e.evidence_id IS NOT NULL), '[]') AS evidence
        FROM cause_candidates c
        LEFT JOIN cause_candidate_evidence e ON e.cause_candidate_id = c.cause_candidate_id
        WHERE c.store_id = $1
        GROUP BY c.cause_candidate_id
        ORDER BY c.created_at DESC
      `,
      [storeId],
    );
    return result.rows;
  }

  async function getCauseCandidateForStore(storeId, causeCandidateId) {
    const rows = await getCauseCandidatesForStore(storeId);
    return rows.find((row) => row.cause_candidate_id === causeCandidateId) ?? null;
  }

  async function createOutboxEvent(event = {}) {
    const result = await query(
      `
        INSERT INTO platform_event_outbox (
          event_type, aggregate_type, aggregate_id, tenant_id, store_id,
          idempotency_key, payload, status, available_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,COALESCE($9, now()))
        ON CONFLICT (idempotency_key)
        DO UPDATE SET updated_at = platform_event_outbox.updated_at
        RETURNING *
      `,
      [
        event.event_type,
        event.aggregate_type,
        event.aggregate_id,
        event.tenant_id ?? null,
        event.store_id ?? null,
        event.idempotency_key ?? null,
        JSON.stringify(safeObject(event.payload)),
        event.status || "pending",
        event.available_at ?? null,
      ],
    );
    return result.rows[0];
  }

  async function markOutboxPublished(eventId) {
    const result = await query(
      "UPDATE platform_event_outbox SET status = 'published', published_at = now(), updated_at = now() WHERE event_id = $1 RETURNING *",
      [eventId],
    );
    return result.rows[0] ?? null;
  }

  async function createJobRun(payload = {}) {
    return withTransaction((client) => createJobRunWithClient(client, payload));
  }

  async function updateJobRun(jobRunId, patch = {}) {
    return withTransaction((client) => updateJobRunWithClient(client, jobRunId, patch));
  }

  async function createMartBuildRun(payload = {}) {
    const result = await query(
      `
        INSERT INTO mart_build_runs (
          store_id, build_type, input_window_start, input_window_end,
          source_upload_id, context_cutoff_at, status, rows_written, error_message, completed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `,
      [
        payload.store_id,
        payload.build_type || "daily_revenue",
        payload.input_window_start ?? null,
        payload.input_window_end ?? null,
        payload.source_upload_id ?? null,
        payload.context_cutoff_at ?? null,
        payload.status || "pending",
        payload.rows_written ?? 0,
        payload.error_message ?? null,
        payload.completed_at ?? null,
      ],
    );
    return result.rows[0];
  }

  async function buildStoreRevenueDailyMart(storeId, range = {}) {
    return withTransaction(async (client) => {
      const run = await client.query(
        `
          INSERT INTO mart_build_runs (store_id, build_type, input_window_start, input_window_end, status)
          VALUES ($1, 'daily_revenue', $2, $3, 'running')
          RETURNING *
        `,
        [storeId, range.start_date ?? null, range.end_date ?? null],
      );
      const facts = await client.query(
        `
          SELECT *
          FROM revenue_daily_facts
          WHERE store_id = $1
            AND ($2::date IS NULL OR business_date >= $2::date)
            AND ($3::date IS NULL OR business_date <= $3::date)
          ORDER BY business_date ASC
        `,
        [storeId, range.start_date ?? null, range.end_date ?? null],
      );
      let rowsWritten = 0;
      for (const fact of facts.rows) {
        const previous = await client.query(
          `
            SELECT *
            FROM revenue_daily_facts
            WHERE store_id = $1 AND business_date = ($2::date - INTERVAL '7 days')::date
            LIMIT 1
          `,
          [storeId, fact.business_date],
        );
        const previousFact = previous.rows[0] ?? null;
        const context = await contextForDate(client, storeId, fact.business_date);
        const aov = Number(fact.order_count) > 0 ? Number(fact.net_sales_amount) / Number(fact.order_count) : 0;
        const previousAov = previousFact && Number(previousFact.order_count) > 0
          ? Number(previousFact.net_sales_amount) / Number(previousFact.order_count)
          : null;
        await client.query(
          `
            INSERT INTO store_revenue_daily_mart (
              store_id, business_date, net_sales_amount, gross_sales_amount, order_count, aov,
              cancel_count, refund_amount, discount_amount, weather_label, rain_mm,
              sales_delta_vs_prev_weekday_pct, order_delta_vs_prev_weekday_pct,
              aov_delta_vs_prev_weekday_pct,
              benchmark_delta_pct, foot_traffic_proxy_delta_pct, same_category_store_count,
              evidence_readiness_score, source_summary, built_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,now())
            ON CONFLICT (store_id, business_date)
            DO UPDATE SET
              net_sales_amount = EXCLUDED.net_sales_amount,
              gross_sales_amount = EXCLUDED.gross_sales_amount,
              order_count = EXCLUDED.order_count,
              aov = EXCLUDED.aov,
              cancel_count = EXCLUDED.cancel_count,
              refund_amount = EXCLUDED.refund_amount,
              discount_amount = EXCLUDED.discount_amount,
              weather_label = EXCLUDED.weather_label,
              rain_mm = EXCLUDED.rain_mm,
              sales_delta_vs_prev_weekday_pct = EXCLUDED.sales_delta_vs_prev_weekday_pct,
              order_delta_vs_prev_weekday_pct = EXCLUDED.order_delta_vs_prev_weekday_pct,
              aov_delta_vs_prev_weekday_pct = EXCLUDED.aov_delta_vs_prev_weekday_pct,
              benchmark_delta_pct = EXCLUDED.benchmark_delta_pct,
              foot_traffic_proxy_delta_pct = EXCLUDED.foot_traffic_proxy_delta_pct,
              same_category_store_count = EXCLUDED.same_category_store_count,
              evidence_readiness_score = EXCLUDED.evidence_readiness_score,
              source_summary = EXCLUDED.source_summary,
              built_at = now()
          `,
          [
            storeId,
            fact.business_date,
            fact.net_sales_amount,
            fact.gross_sales_amount,
            fact.order_count,
            aov,
            fact.cancel_count,
            fact.refund_amount,
            fact.discount_amount,
            context.weather_label,
            context.rain_mm,
            percentageDelta(fact.net_sales_amount, previousFact?.net_sales_amount),
            percentageDelta(fact.order_count, previousFact?.order_count),
            percentageDelta(aov, previousAov),
            context.benchmark_delta_pct,
            context.foot_traffic_proxy_delta_pct,
            context.same_category_store_count,
            context.evidence_readiness_score,
            JSON.stringify({
              revenue_source_upload_id: fact.source_upload_id,
              context_observed_together: context.evidence_readiness_score > 0.5,
              not_proven_causality: true,
            }),
          ],
        );
        rowsWritten += 1;
      }
      const completed = await client.query(
        "UPDATE mart_build_runs SET status = 'completed', rows_written = $1, completed_at = now() WHERE mart_build_run_id = $2 RETURNING *",
        [rowsWritten, run.rows[0].mart_build_run_id],
      );
      await createOutboxEventWithClient(client, {
        event_type: "mart.daily_revenue.built",
        aggregate_type: "store",
        aggregate_id: storeId,
        store_id: storeId,
        idempotency_key: `mart.daily_revenue.built:${storeId}:${run.rows[0].mart_build_run_id}`,
        payload: { rows_written: rowsWritten },
      });
      return { mart_build_run: completed.rows[0], rows_written: rowsWritten };
    });
  }

  async function getStoreRevenueDailyMart(storeId, range = {}) {
    const result = await query(
      `
        SELECT *
        FROM store_revenue_daily_mart
        WHERE store_id = $1
          AND ($2::date IS NULL OR business_date >= $2::date)
          AND ($3::date IS NULL OR business_date <= $3::date)
        ORDER BY business_date DESC
      `,
      [storeId, range.start_date ?? null, range.end_date ?? null],
    );
    return result.rows;
  }

  async function getStore(storeId) {
    return one("SELECT * FROM stores WHERE store_id = $1", [storeId]);
  }

  async function one(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0] ?? null;
  }

  return {
    _backend: "aurora",
    resolveAppUserFromJwtClaims,
    requireAuthenticatedAppUser,
    requireStoreAccess,
    listStoresForUser,
    createStoreForUser,
    getBriefsForStore,
    getAnomaliesForStore,
    getActionsForStore,
    updateActionStatusForStore,
    ingestRevenueUpload,
    previewRevenueUpload,
    listRevenueUploadsForStore,
    listRejectedRowsForUpload,
    getRejectedRowsForUpload,
    reprocessRevenueUpload,
    getContextForStore,
    collectContextForStore,
    getPipelineMetaForStore,
    getCauseCandidatesForStore,
    getCauseCandidateForStore,
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

async function getStoreWithClient(client, storeId) {
  const result = await client.query("SELECT * FROM stores WHERE store_id = $1", [storeId]);
  return result.rows[0] ?? null;
}

async function getActionByIdWithClient(client, storeId, actionId) {
  const result = await client.query(
    `
      SELECT
        a.*,
        c.title AS cause_title,
        c.summary AS cause_summary,
        c.confidence AS cause_confidence,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'evidence_id', e.evidence_id,
            'evidence_type', e.evidence_type,
            'strength', e.strength,
            'summary', e.summary,
            'source_name', e.source_name,
            'source_ref', e.source_ref,
            'metric_name', e.metric_name,
            'metric_value', e.metric_value
          )) FILTER (WHERE e.evidence_id IS NOT NULL),
          '[]'
        ) AS evidence_snippets,
        (
          SELECT row_to_json(o)
          FROM action_outcome_snapshots o
          WHERE o.action_id = a.action_id
          ORDER BY o.created_at DESC
          LIMIT 1
        ) AS outcome_tracking
      FROM action_planner_items a
      LEFT JOIN cause_candidates c ON c.cause_candidate_id = a.cause_candidate_id
      LEFT JOIN cause_candidate_evidence e ON e.cause_candidate_id = c.cause_candidate_id
      WHERE a.store_id = $1 AND a.action_id = $2
      GROUP BY a.action_id, c.cause_candidate_id
      LIMIT 1
    `,
    [storeId, actionId],
  );
  return result.rows[0] ? mapActionRow(result.rows[0]) : null;
}

function mapActionRow(row) {
  return {
    ...row,
    action_type: row.action_family,
    cause_candidate: row.cause_candidate_id ? {
      cause_candidate_id: row.cause_candidate_id,
      title: row.cause_title,
      summary: row.cause_summary,
      confidence: row.cause_confidence,
    } : null,
    evidence_snippets: row.evidence_snippets ?? [],
    outcome_tracking: row.outcome_tracking ?? {
      summary: "결과 추적 대기 중",
      summary_en: "Waiting for result window",
    },
  };
}

async function createOutboxEventWithClient(client, event = {}) {
  const result = await client.query(
    `
      INSERT INTO platform_event_outbox (
        event_type, aggregate_type, aggregate_id, tenant_id, store_id,
        idempotency_key, payload, status, available_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,COALESCE($9, now()))
      ON CONFLICT (idempotency_key)
      DO UPDATE SET updated_at = platform_event_outbox.updated_at
      RETURNING *
    `,
    [
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      event.tenant_id ?? null,
      event.store_id ?? null,
      event.idempotency_key ?? null,
      JSON.stringify(safeObject(event.payload)),
      event.status || "pending",
      event.available_at ?? null,
    ],
  );
  return result.rows[0];
}

async function createJobRunWithClient(client, payload = {}) {
  const result = await client.query(
    `
      INSERT INTO job_runs (
        job_type, target_kind, target_id, tenant_id, store_id, status,
        started_at, completed_at, error_code, error_message, input_payload, result_summary
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
      RETURNING *
    `,
    [
      payload.job_type,
      payload.target_kind ?? null,
      payload.target_id ?? null,
      payload.tenant_id ?? null,
      payload.store_id ?? null,
      payload.status || "pending",
      payload.started_at ?? null,
      payload.completed_at ?? null,
      payload.error_code ?? null,
      payload.error_message ?? null,
      JSON.stringify(safeObject(payload.input_payload)),
      JSON.stringify(safeObject(payload.result_summary)),
    ],
  );
  return result.rows[0];
}

async function updateJobRunWithClient(client, jobRunId, patch = {}) {
  const result = await client.query(
    `
      UPDATE job_runs
      SET
        status = COALESCE($2, status),
        completed_at = COALESCE($3, completed_at),
        error_code = COALESCE($4, error_code),
        error_message = COALESCE($5, error_message),
        result_summary = COALESCE($6::jsonb, result_summary),
        updated_at = now()
      WHERE job_run_id = $1
      RETURNING *
    `,
    [
      jobRunId,
      patch.status ?? null,
      patch.completed_at ?? null,
      patch.error_code ?? null,
      patch.error_message ?? null,
      patch.result_summary ? JSON.stringify(safeObject(patch.result_summary)) : null,
    ],
  );
  return result.rows[0] ?? null;
}

async function contextForDate(client, storeId, businessDate) {
  const result = await client.query(
    `
      SELECT metric_name, metric_value, label
      FROM context_observations
      WHERE store_id = $1 AND observation_date = $2
    `,
    [storeId, businessDate],
  );
  const byMetric = new Map(result.rows.map((row) => [row.metric_name, row]));
  const nearby = await client.query(
    "SELECT same_category_store_count FROM nearby_store_snapshots WHERE store_id = $1 ORDER BY snapshot_date DESC LIMIT 1",
    [storeId],
  );
  const hasContext = result.rows.length > 0 || nearby.rows[0];
  return {
    weather_label: byMetric.get("rainfall_mm")?.label ?? null,
    rain_mm: byMetric.get("rainfall_mm")?.metric_value ?? null,
    benchmark_delta_pct: byMetric.get("commercial_area_sales_delta_pct")?.metric_value ?? null,
    foot_traffic_proxy_delta_pct: byMetric.get("foot_traffic_proxy_delta_pct")?.metric_value ?? null,
    same_category_store_count: nearby.rows[0]?.same_category_store_count ?? null,
    evidence_readiness_score: hasContext ? 0.8 : 0.45,
  };
}

async function scalarCount(client, table, column, value) {
  const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`, [value]);
  return result.rows[0]?.count ?? 0;
}

function percentageDelta(current, previous) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) {
    return null;
  }
  return Math.round(((currentNumber - previousNumber) / previousNumber) * 10000) / 100;
}

function loadStep3SchemaSql() {
  const candidates = [
    path.join(__dirname, "revenue_ops_step3_4_lite.sql"),
    path.join(__dirname, "..", "..", "..", "infra", "db", "revenue_ops_step3_4_lite.sql"),
    path.join(process.cwd(), "infra", "db", "revenue_ops_step3_4_lite.sql"),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error("Missing revenue_ops_step3_4_lite.sql for Aurora SaaS schema bootstrap");
  }
  return fs.readFileSync(filePath, "utf8");
}

function createOptionalAuroraRevenueOpsSaasStoreFromEnv({ env = process.env } = {}) {
  if (env.REVENUE_OPS_SAAS_STORE_BACKEND === "memory") {
    return null;
  }
  if (env.AURORA_DATABASE_URL || env.DATABASE_URL || (env.AURORA_SECRET_ARN && env.AURORA_CLUSTER_ENDPOINT)) {
    return createAuroraRevenueOpsSaasStore({ env });
  }
  return null;
}

module.exports = {
  createAuroraRevenueOpsSaasStore,
  createOptionalAuroraRevenueOpsSaasStoreFromEnv,
  loadStep3SchemaSql,
};
