const fs = require("node:fs");
const path = require("node:path");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require("pg");

const exportData = require("./data/revenue_ops_export.json");
const m6DemoDataset = require("./data/m6_demo_revenue_dataset.json");
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
  prepareRevenueUploadRows,
  buildSyntheticDailyRows,
  buildSyntheticItemRows,
  text,
  safeObject,
  clone,
} = require("./revenue-ops-saas-store");
const { collectStorePublicContext, planStorePublicContextCollection, normalizeContextCollectionReason } = require("./context-collectors");
const { loadPublicContextCredentials } = require("./public-context-credentials");
const { loadRevenueConnectorCredentials } = require("./connector-credentials");
const { previewRevenueUploadPayload } = require("./revenue-upload-parsers");
const { VALID_ACTION_STATUSES } = require("./revenue-ops-store");

const DEFAULT_DEMO_PROFILE = m6DemoDataset.stores[0];
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
      await seedDemoStoresForUser(appUserId);
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
    const stores = await seedDemoStoresForUser(appUserId);
    return stores[0] ?? null;
  }

  async function seedDemoStoresForUser(appUserId) {
    const stores = [];
    for (const profile of m6DemoDataset.stores ?? [DEFAULT_DEMO_PROFILE]) {
      stores.push(await seedDemoStoreProfileForUser(appUserId, profile));
    }
    return stores;
  }

  async function seedDemoStoreProfileForUser(appUserId, profile) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `
          SELECT s.*
          FROM store_members sm
          JOIN stores s ON s.store_id = sm.store_id
          WHERE sm.app_user_id = $1
            AND s.store_type = 'demo'
            AND (s.metadata->>'demo_scenario' = $2 OR s.store_name = $3)
          LIMIT 1
        `,
        [appUserId, profile.demo_scenario, profile.store_name],
      );
      if (existing.rows[0]) {
        await seedStoreContentWithClient(client, existing.rows[0], appUserId, profile);
        return existing.rows[0];
      }

      const tenantResult = await client.query(
        `
          INSERT INTO tenants (tenant_name, tenant_type, created_by)
          VALUES ($1, 'demo', $2)
          RETURNING *
        `,
        [profile.tenant_name, appUserId],
      );
      const tenant = tenantResult.rows[0];
      const storeResult = await client.query(
        `
          INSERT INTO stores (
            tenant_id, store_name, store_type, business_category, region,
            address_text, timezone, metadata, created_by
          )
          VALUES ($1, $2, 'demo', $3, $4, $5, 'Asia/Seoul', $6::jsonb, $7)
          RETURNING *
        `,
        [
          tenant.tenant_id,
          profile.store_name,
          profile.business_category,
          profile.region,
          profile.address_text,
          JSON.stringify(profile.metadata),
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
      await seedStoreContentWithClient(client, store, appUserId, profile);
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

  async function seedStoreContentWithClient(client, store, appUserId, profile = null) {
    await seedRevenueFactsWithClient(client, store, appUserId, profile);
    await seedContextWithClient(client, store);
    await seedCauseActionLoopWithClient(client, store);
  }

  async function seedRevenueFactsWithClient(client, store, appUserId, profile = null) {
    const exists = await client.query("SELECT 1 FROM revenue_uploads WHERE store_id = $1 AND source_type IN ('synthetic_seed', 'm6_synthetic_demo_seed') LIMIT 1", [store.store_id]);
    if (exists.rows[0]) return;
    const dailyRows = profile?.revenue_daily_rows ?? buildSyntheticDailyRows();
    const itemRows = buildSyntheticItemRows(dailyRows);
    const upload = await client.query(
      `
        INSERT INTO revenue_uploads (
          store_id, uploaded_by, source_type, original_filename, file_type,
          status, row_count, accepted_count, rejected_count, metadata
        )
        VALUES ($1, $2, 'm6_synthetic_demo_seed', $5, 'json',
          'accepted', $3, $3, 0, $4::jsonb)
        RETURNING upload_id
      `,
      [
        store.store_id,
        appUserId,
        dailyRows.length + itemRows.length,
        JSON.stringify({
          is_demo: true,
          demo_scenario: profile?.demo_scenario ?? "seongsu_cafe_seed",
          generated_for: "m6_presentation",
          synthetic_notice: "Not real individual store revenue.",
        }),
        profile ? `${profile.demo_scenario}.json` : "synthetic_daily_revenue.json",
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
        SELECT $1, 'Seongsu commercial district seed label', 'Seongsu-dong', $2,
          'manual_seed', 'medium', '{"official_code_verified": false}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM commercial_area_mappings
          WHERE store_id = $1
            AND commercial_area_name = 'Seongsu commercial district seed label'
            AND mapping_method = 'manual_seed'
        )
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

  async function ensureCauseCandidatesForStore(storeId) {
    return withTransaction((client) => ensureCauseCandidatesForStoreWithClient(client, storeId));
  }

  async function ensureCauseCandidatesForStoreWithClient(client, storeId) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cause-actions:${storeId}`]);
    const store = await getStoreWithClient(client, storeId);
    if (!store) return [];
    const hasRevenueFacts = await client.query("SELECT 1 FROM revenue_daily_facts WHERE store_id = $1 LIMIT 1", [storeId]);
    if (!hasRevenueFacts.rows[0]) return [];
    const existingAny = await client.query("SELECT 1 FROM cause_candidates WHERE store_id = $1 LIMIT 1", [storeId]);
    if (store.store_type === "demo" && existingAny.rows[0]) {
      return selectCauseCandidatesWithClient(client, storeId);
    }

    const signals = await buildCauseCandidateSignalsWithClient(client, store);
    for (const signal of signals) {
      const existing = await client.query(
        `
          SELECT *
          FROM cause_candidates
          WHERE store_id = $1
            AND candidate_type = $2
            AND title = $3
          LIMIT 1
        `,
        [storeId, signal.candidate_type, signal.title],
      );
      let candidate = existing.rows[0];
      if (!candidate) {
        const inserted = await client.query(
          `
            INSERT INTO cause_candidates (
              store_id, candidate_type, title, summary, confidence, metric_name,
              baseline_start, baseline_end, compare_start, compare_end,
              observed_delta_pct, created_from
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
          `,
          [
            storeId,
            signal.candidate_type,
            signal.title,
            signal.summary,
            signal.confidence,
            signal.metric_name,
            signal.baseline_start,
            signal.baseline_end,
            signal.compare_start,
            signal.compare_end,
            signal.observed_delta_pct,
            signal.created_from,
          ],
        );
        candidate = inserted.rows[0];
      }

      for (const evidence of signal.evidence) {
        await ensureCauseEvidenceWithClient(client, candidate.cause_candidate_id, evidence);
      }
    }

    return selectCauseCandidatesWithClient(client, storeId);
  }

  async function ensureCauseEvidenceWithClient(client, causeCandidateId, evidence) {
    const existing = await client.query(
      `
        SELECT 1
        FROM cause_candidate_evidence
        WHERE cause_candidate_id = $1
          AND evidence_type = $2
          AND COALESCE(source_ref, '') = COALESCE($3, '')
          AND COALESCE(metric_name, '') = COALESCE($4, '')
        LIMIT 1
      `,
      [causeCandidateId, evidence.evidence_type, evidence.source_ref ?? null, evidence.metric_name ?? null],
    );
    if (existing.rows[0]) return;

    await client.query(
      `
        INSERT INTO cause_candidate_evidence (
          cause_candidate_id, evidence_type, strength, summary, source_name,
          source_ref, metric_name, metric_value, metadata
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      `,
      [
        causeCandidateId,
        evidence.evidence_type,
        evidence.strength,
        evidence.summary,
        evidence.source_name ?? null,
        evidence.source_ref ?? null,
        evidence.metric_name ?? null,
        evidence.metric_value ?? null,
        JSON.stringify(safeObject(evidence.metadata)),
      ],
    );
  }

  async function buildCauseCandidateSignalsWithClient(client, store) {
    const stats = await client.query(
      `
        SELECT
          count(*)::int AS day_count,
          min(business_date)::text AS min_date,
          max(business_date)::text AS max_date,
          avg(net_sales_amount)::numeric AS avg_net_sales,
          min(net_sales_amount)::numeric AS min_net_sales,
          avg(order_count)::numeric AS avg_order_count,
          min(order_count)::numeric AS min_order_count,
          (
            SELECT business_date::text
            FROM revenue_daily_facts
            WHERE store_id = $1
            ORDER BY net_sales_amount ASC, business_date ASC
            LIMIT 1
          ) AS lowest_sales_date
        FROM revenue_daily_facts
        WHERE store_id = $1
      `,
      [store.store_id],
    );
    const revenue = stats.rows[0] ?? {};
    const context = await client.query(
      `
        SELECT co.*, cs.source_name
        FROM context_observations co
        LEFT JOIN context_sources cs ON cs.source_id = co.source_id
        WHERE co.store_id = $1
        ORDER BY co.observation_date DESC NULLS LAST, co.created_at DESC
      `,
      [store.store_id],
    );
    const itemCategory = await client.query(
      `
        SELECT item_category, sum(quantity)::numeric AS quantity, sum(net_sales_amount)::numeric AS net_sales_amount
        FROM revenue_item_facts
        WHERE store_id = $1 AND item_category IS NOT NULL
        GROUP BY item_category
        ORDER BY sum(net_sales_amount) ASC NULLS LAST
        LIMIT 1
      `,
      [store.store_id],
    );
    const nearby = await client.query(
      "SELECT * FROM nearby_store_snapshots WHERE store_id = $1 ORDER BY snapshot_date DESC LIMIT 1",
      [store.store_id],
    );

    const byType = new Map();
    for (const row of context.rows) {
      if (!byType.has(row.context_type)) byType.set(row.context_type, row);
    }
    const weather = byType.get("weather");
    const benchmark = byType.get("benchmark");
    const footTraffic = byType.get("foot_traffic");
    const competition = byType.get("competition") ?? nearby.rows[0];
    const dayCount = Number(revenue.day_count ?? 0);
    const minNet = Number(revenue.min_net_sales ?? 0);
    const avgNet = Number(revenue.avg_net_sales ?? 0);
    const observedDelta = avgNet > 0 ? percentageDelta(minNet, avgNet) : null;
    const periodStart = revenue.min_date ?? null;
    const periodEnd = revenue.max_date ?? null;
    const compareDate = revenue.lowest_sales_date ?? periodEnd;
    const evidence = [];

    if (dayCount > 0) {
      evidence.push({
        evidence_type: "revenue_change",
        strength: Math.abs(Number(observedDelta ?? 0)) >= 15 ? "strong" : "medium",
        summary: `업로드된 매출 데이터에서 최저 매출일과 평균 매출 차이가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.`,
        source_name: "Aurora revenue_daily_facts",
        source_ref: `revenue_daily_facts:${store.store_id}`,
        metric_name: "net_sales_amount",
        metric_value: minNet || null,
        metadata: { day_count: dayCount, avg_net_sales: avgNet || null, not_proven_causality: true },
      });
    }
    if (weather) evidence.push(contextEvidence(weather, "weather", "medium"));
    if (benchmark) evidence.push(contextEvidence(benchmark, "benchmark", "medium"));
    if (footTraffic) evidence.push(contextEvidence(footTraffic, "foot_traffic", "medium"));
    if (competition) {
      evidence.push({
        evidence_type: "competition",
        strength: "weak",
        summary: `동종 업종 밀도 신호가 함께 관측되었습니다. 가능성 높은 원인 후보일 뿐 추가 확인이 필요합니다.`,
        source_name: competition.source_name ?? "Nearby store snapshot seed",
        source_ref: competition.observation_id ?? competition.snapshot_id ?? `nearby_store_snapshots:${store.store_id}`,
        metric_name: competition.metric_name ?? "same_category_store_count",
        metric_value: competition.metric_value ?? competition.same_category_store_count ?? null,
        metadata: { not_proven_causality: true },
      });
    }

    const signals = [];
    if (dayCount > 0) {
      signals.push({
        candidate_type: weather ? "rainy_day_offline_drop" : "order_count_decline",
        title: weather ? "비 오는 날 오프라인 주문 하락 가능성" : "주문수 하락 가능성",
        summary: weather
          ? "비 오는 날과 매출/주문 하락 신호가 함께 관측되었습니다. 인과가 확정된 것은 아니며 추가 확인이 필요합니다."
          : "업로드된 매출 데이터에서 주문수와 매출 변화가 함께 관측되었습니다. 가능성 높은 원인 후보이며 추가 확인이 필요합니다.",
        confidence: weather ? "medium" : "weak",
        metric_name: weather ? "net_sales_amount" : "order_count",
        baseline_start: periodStart,
        baseline_end: periodEnd,
        compare_start: compareDate,
        compare_end: compareDate,
        observed_delta_pct: observedDelta,
        created_from: "revenue_mart",
        evidence: evidence.length ? evidence : fallbackProjectionEvidence(store),
      });
    }
    if (benchmark) {
      signals.push({
        candidate_type: "benchmark_downturn",
        title: "상권 벤치마크 약세 가능성",
        summary: "상권 벤치마크 약세와 매장 매출 변화가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
        confidence: "weak",
        metric_name: benchmark.metric_name,
        baseline_start: periodStart,
        baseline_end: periodEnd,
        compare_start: benchmark.observation_date ?? compareDate,
        compare_end: benchmark.observation_date ?? compareDate,
        observed_delta_pct: benchmark.metric_value,
        created_from: "revenue_mart",
        evidence: [contextEvidence(benchmark, "benchmark", "medium")],
      });
    }
    if (footTraffic) {
      signals.push({
        candidate_type: "foot_traffic_drop",
        title: "유동인구 프록시 하락 가능성",
        summary: "유동인구 프록시 하락과 매출 변화가 함께 관측되었습니다. 추가 확인이 필요합니다.",
        confidence: "weak",
        metric_name: footTraffic.metric_name,
        baseline_start: periodStart,
        baseline_end: periodEnd,
        compare_start: footTraffic.observation_date ?? compareDate,
        compare_end: footTraffic.observation_date ?? compareDate,
        observed_delta_pct: footTraffic.metric_value,
        created_from: "revenue_mart",
        evidence: [contextEvidence(footTraffic, "foot_traffic", "medium")],
      });
    }
    if (itemCategory.rows[0]) {
      const item = itemCategory.rows[0];
      signals.push({
        candidate_type: "item_category_decline",
        title: `${item.item_category} 품목 믹스 점검 필요`,
        summary: "품목별 매출 데이터가 매출 변화 구간과 함께 관측되었습니다. 품목 믹스 원인 후보는 추가 확인이 필요합니다.",
        confidence: "weak",
        metric_name: "item_category_net_sales_amount",
        baseline_start: periodStart,
        baseline_end: periodEnd,
        compare_start: compareDate,
        compare_end: compareDate,
        observed_delta_pct: null,
        created_from: "revenue_mart",
        evidence: [{
          evidence_type: "revenue_change",
          strength: "weak",
          summary: `${item.item_category} 품목 매출 신호가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.`,
          source_name: "Aurora revenue_item_facts",
          source_ref: `revenue_item_facts:${store.store_id}:${item.item_category}`,
          metric_name: "item_category_net_sales_amount",
          metric_value: item.net_sales_amount,
          metadata: { quantity: item.quantity, not_proven_causality: true },
        }],
      });
    }

    if (signals.length === 0) {
      signals.push({
        candidate_type: "other",
        title: "매출 데이터 품질 점검 필요",
        summary: "원인 후보 생성을 위해 업로드 매출 데이터와 공개 맥락 데이터의 추가 확인이 필요합니다.",
        confidence: "weak",
        metric_name: "data_readiness",
        baseline_start: null,
        baseline_end: null,
        compare_start: null,
        compare_end: null,
        observed_delta_pct: null,
        created_from: "future_ai",
        evidence: fallbackProjectionEvidence(store),
      });
    }

    return signals;
  }

  function contextEvidence(row, evidenceType, strength) {
    return {
      evidence_type: evidenceType,
      strength,
      summary: `${row.label ?? row.metric_name}. 인과가 확정된 것은 아닙니다.`,
      source_name: row.source_name ?? row.source_id,
      source_ref: row.observation_id ?? row.source_id,
      metric_name: row.metric_name,
      metric_value: row.metric_value,
      metadata: { observation_date: row.observation_date, not_proven_causality: true },
    };
  }

  function fallbackProjectionEvidence(store) {
    return [{
      evidence_type: "revenue_change",
      strength: "weak",
      summary: "기존 브리프 원인 후보와 매출 변화 신호가 함께 관측되었습니다. 추가 확인이 필요합니다.",
      source_name: "Revenue brief projection fallback",
      source_ref: `brief_projection:${store.store_id}`,
      metric_name: "data_readiness",
      metric_value: null,
      metadata: { not_proven_causality: true },
    }];
  }

  async function ensureActionPlannerItemsForStore(storeId) {
    return withTransaction((client) => ensureActionPlannerItemsForStoreWithClient(client, storeId));
  }

  async function ensureActionPlannerItemsForStoreWithClient(client, storeId) {
    const candidates = await ensureCauseCandidatesForStoreWithClient(client, storeId);
    for (const candidate of candidates) {
      const action = actionForCauseCandidate(storeId, candidate);
      await client.query(
        `
          INSERT INTO action_planner_items (
            store_id, cause_candidate_id, action_family, dedupe_key, title,
            description, why_this_action, expected_effect, risk_note,
            difficulty, status, outcome_summary
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'recommended','결과 추적 대기 중')
          ON CONFLICT (store_id, dedupe_key) DO NOTHING
        `,
        [
          storeId,
          candidate.cause_candidate_id,
          action.action_family,
          action.dedupe_key,
          action.title,
          action.description,
          action.why_this_action,
          action.expected_effect,
          action.risk_note,
          action.difficulty,
        ],
      );
    }
    const result = await client.query("SELECT * FROM action_planner_items WHERE store_id = $1 ORDER BY updated_at DESC", [storeId]);
    return result.rows;
  }

  function actionForCauseCandidate(storeId, candidate) {
    const defaults = {
      action_family: "data_quality_check",
      title: "매출/맥락 데이터 품질을 먼저 점검하세요",
      description: "원인 후보를 실행 액션으로 옮기기 전에 업로드 기간, 누락일, 공개 맥락 연결을 확인합니다.",
      expected_effect: "다음 분석에서 근거 품질과 실행 우선순위가 더 명확해지는지 관측합니다.",
      difficulty: "low",
    };
    const byType = {
      rainy_day_offline_drop: {
        action_family: "rainy_day_delivery_boost",
        title: "비 오는 날 배달/포장 세트 메뉴를 테스트하세요",
        description: "비 예보가 있는 날에 커피+디저트 포장 세트를 작게 테스트합니다.",
        expected_effect: "오프라인 방문 하락 구간에서 배달/포장 전환과 주문수 변화를 관측합니다.",
        difficulty: "medium",
      },
      item_category_decline: {
        action_family: "bundle_attach_rate_recovery",
        title: "커피+디저트 세트 구성을 테스트하세요",
        description: "품목 믹스 변화 구간에 맞춰 세트 구성을 작게 테스트합니다.",
        expected_effect: "객단가와 결합률 변화를 다음 측정 기간에 관측합니다.",
        difficulty: "medium",
      },
      aov_decline: {
        action_family: "upsell_menu_test",
        title: "1,000~2,000원 추가 옵션을 테스트하세요",
        description: "주문 흐름에서 부담이 작은 옵션 또는 사이드 메뉴 추천을 테스트합니다.",
        expected_effect: "객단가와 취소율 변화를 함께 관측합니다.",
        difficulty: "medium",
      },
      benchmark_downturn: {
        action_family: "benchmark_watch",
        title: "상권 약세 구간에서는 재방문 액션을 우선 검토하세요",
        description: "신규 유입 확대보다 재방문 쿠폰/스탬프 액션을 작은 범위로 테스트합니다.",
        expected_effect: "재방문 주문수와 매출 방어 정도를 관측합니다.",
        difficulty: "medium",
      },
      order_count_decline: {
        action_family: "offpeak_promotion",
        title: "하락 시간대에 맞춘 짧은 프로모션을 테스트하세요",
        description: "주문수 하락 구간에 한정해 짧은 메뉴 프로모션을 실행합니다.",
        expected_effect: "주문수 회복 여부를 다음 측정 기간에 관측합니다.",
        difficulty: "medium",
      },
      foot_traffic_drop: {
        action_family: "offpeak_promotion",
        title: "유동인구 약세 시간대에 맞춘 짧은 프로모션을 테스트하세요",
        description: "유동인구 프록시 약세 구간과 겹치는 시간대에 작게 테스트합니다.",
        expected_effect: "주문수와 객단가 변화를 함께 관측합니다.",
        difficulty: "medium",
      },
    };
    const selected = byType[candidate.candidate_type] ?? defaults;
    return {
      ...selected,
      dedupe_key: `${storeId}:${selected.action_family}:${candidate.candidate_type}:${candidate.metric_name ?? "metric"}`,
      why_this_action: `${candidate.summary} 이 액션은 근거 기반 제안이며 효과가 보장되지는 않습니다.`,
      risk_note: "인과가 확정된 것은 아닙니다. 실행 전 추가 확인이 필요합니다.",
    };
  }

  async function getBriefsForStore(storeId) {
    const store = await getStore(storeId);
    const latest = await query(
      "SELECT max(business_date) AS latest_date, count(*)::int AS day_count FROM revenue_daily_facts WHERE store_id = $1",
      [storeId],
    );
    if (Number(latest.rows[0]?.day_count ?? 0) === 0) {
      return [];
    }
    await ensureActionPlannerItemsForStore(storeId);
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
    if (Number(row.day_count ?? 0) === 0) {
      return [];
    }
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
      compare_period: "observed minimum day",
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
    await ensureActionPlannerItemsForStore(storeId);
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
          rows.length + prepared.rejectedRows.length,
          JSON.stringify({ ...safeObject(payload.metadata), ...prepared.metadata }),
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
      for (const rejectedRow of prepared.rejectedRows) {
        rejectedCount += 1;
        const rejected = await client.query(
          `
            INSERT INTO revenue_upload_rejected_rows (
              upload_id, row_number, reason_code, reason_message, raw_row_preview
            )
            VALUES ($1,$2,$3,$4,$5::jsonb)
            RETURNING *
          `,
          [upload.upload_id, rejectedRow.row_number, rejectedRow.reason_code, rejectedRow.reason_message, JSON.stringify(sanitizeRevenueRow(rejectedRow.raw_row_preview))],
        );
        rejectedRows.push(rejected.rows[0]);
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
      if (acceptedCount > 0) {
        await ensureActionPlannerItemsForStoreWithClient(client, storeId);
      }
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

  async function collectContextForStore(storeId, { mode = "seed", collectors = null, reason: requestedReason = "manual_refresh" } = {}) {
    const reason = normalizeContextCollectionReason(requestedReason);
    return withTransaction(async (client) => {
      const store = await getStoreWithClient(client, storeId);
      if (!store) return null;
      const storeLocation = await getStoreLocationWithClient(client, storeId);
      const latestRevenueDate = await getLatestRevenueDateWithClient(client, storeId);
      const publicCredentials = await loadPublicContextCredentials({ env });
      const connectorCredentials = await loadRevenueConnectorCredentials({ env });
      const credentials = { ...publicCredentials, ...connectorCredentials };
      const collectionPlan = planStorePublicContextCollection({ mode, env, credentials, collectors });
      const job = await createJobRunWithClient(client, {
        job_type: "context_collect",
        target_kind: "store",
        target_id: storeId,
        store_id: storeId,
        status: "running",
        started_at: new Date(),
        input_payload: { mode, collectors, reason, resolved_mode: collectionPlan.resolved_mode },
      });
      const liveResult = await collectStorePublicContext({
        store,
        mode,
        reason,
        env,
        credentials,
        storeLocation,
        latestRevenueDate,
        collectors,
      });
      const livePersisted = await persistLiveContextResultWithClient(client, store, liveResult);
      const seedFallbackUsed = mode === "seed" || liveResult.seed_fallback_recommended;
      if (seedFallbackUsed) {
        await seedContextWithClient(client, store);
      }
      await ensureActionPlannerItemsForStoreWithClient(client, storeId);
      const completedCount = liveResult.collectors?.filter((collector) => collector.status === "completed").length ?? 0;
      const failedCount = liveResult.collectors?.filter((collector) => collector.status === "failed").length ?? 0;
      const skippedCount = liveResult.collectors?.filter((collector) => collector.status === "skipped").length ?? 0;
      const timedOutCount = liveResult.collectors?.filter((collector) => collector.reason === "request_timeout").length ?? 0;
      const collectorStatus = seedFallbackUsed || completedCount > 0
        ? "completed"
        : failedCount > 0
          ? "failed"
          : "skipped";
      const collector = await client.query(
        `
          INSERT INTO collector_runs (
            collector_name, status, target_store_id, started_at, completed_at, error_message, metadata
          )
          VALUES ('collectStorePublicContext', $2, $1, now(), now(), $3, $4::jsonb)
          RETURNING *
        `,
        [storeId, collectorStatus, collectorStatus === "failed" ? "One or more live collectors failed; see sanitized metadata." : null, JSON.stringify({
          mode,
          reason,
          requested_mode: liveResult.requested_mode,
          resolved_mode: liveResult.resolved_mode,
          credential_source: publicCredentials.credentialSource,
          credential_load_warning: publicCredentials.credentialLoadWarning ?? null,
          connector_credential_sources: {
            toss_place: connectorCredentials.tossPlace?.credentialSource ?? "missing",
            delivery_provider: connectorCredentials.deliveryProvider?.credentialSource ?? "missing",
          },
          collectors: liveResult.collectors,
          total_duration_ms: liveResult.total_duration_ms,
          global_budget_ms: liveResult.global_budget_ms,
          completed_collector_count: completedCount,
          skipped_collector_count: skippedCount,
          failed_collector_count: failedCount,
          timed_out_collector_count: timedOutCount,
          seed_fallback_used: seedFallbackUsed,
          persisted: livePersisted,
          external_api_keys_required: false,
          s3_bronze: { status: env.BRONZE_BUCKET_NAME ? "not_configured_no_s3_client_dependency" : "disabled_missing_bucket" },
        })],
      );
      const completed = await updateJobRunWithClient(client, job.job_run_id, {
        status: collectorStatus,
        completed_at: new Date(),
        error_message: collectorStatus === "failed" ? "Live public context collector failed safely." : null,
        result_summary: {
          collector_run_id: collector.rows[0].collector_run_id,
          collectors: liveResult.collectors,
          reason,
          total_duration_ms: liveResult.total_duration_ms,
          global_budget_ms: liveResult.global_budget_ms,
          seed_fallback_used: seedFallbackUsed,
        },
      });
      return {
        collector_run: collector.rows[0],
        job_run: completed,
        summary: {
          context_observation_count: await scalarCount(client, "context_observations", "store_id", storeId),
          benchmark_count: livePersisted.benchmark_count,
          nearby_snapshot_count: livePersisted.nearby_snapshot_count,
          completed_collector_count: completedCount,
          skipped_collector_count: skippedCount,
          failed_collector_count: failedCount,
          timed_out_collector_count: timedOutCount,
          total_duration_ms: liveResult.total_duration_ms,
          global_budget_ms: liveResult.global_budget_ms,
          collector_plan: collectionPlan,
          collectors: liveResult.collectors,
          seed_fallback_used: seedFallbackUsed,
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
    const collectorMeta = safeObject(latestCollectorRun?.metadata);
    const collectors = Array.isArray(collectorMeta.collectors) ? collectorMeta.collectors : [];
    const latestLiveCollector = collectors
      .filter((collector) => collector.status === "completed" && collector.collected_at)
      .sort((left, right) => String(right.collected_at).localeCompare(String(left.collected_at)))[0] ?? null;
    return {
      store_id: storeId,
      store_name: (await getStore(storeId))?.store_name ?? null,
      latest_revenue_upload: latestUpload,
      latest_context_observation: latestContext,
      latest_public_benchmark_period: latestBenchmark ? {
        period_start: latestBenchmark.period_start,
        period_end: latestBenchmark.period_end,
        source_id: latestBenchmark.source_id,
      } : null,
      latest_collector_run: latestCollectorRun,
      latest_context_collection_reason: collectorMeta.reason ?? null,
      completed_collector_count: collectorMeta.completed_collector_count ?? collectors.filter((collector) => collector.status === "completed").length,
      skipped_collector_count: collectorMeta.skipped_collector_count ?? collectors.filter((collector) => collector.status === "skipped").length,
      failed_collector_count: collectorMeta.failed_collector_count ?? collectors.filter((collector) => collector.status === "failed").length,
      timed_out_collector_count: collectorMeta.timed_out_collector_count ?? collectors.filter((collector) => collector.reason === "request_timeout").length,
      latest_live_context_collected_at: latestLiveCollector?.collected_at ?? null,
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
    await ensureCauseCandidatesForStore(storeId);
    return selectCauseCandidatesWithClient({ query }, storeId);
  }

  async function selectCauseCandidatesWithClient(client, storeId) {
    const result = await client.query(
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
    ensureCauseCandidatesForStore,
    ensureActionPlannerItemsForStore,
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

async function getStoreLocationWithClient(client, storeId) {
  const result = await client.query("SELECT * FROM store_locations WHERE store_id = $1", [storeId]);
  return result.rows[0] ?? null;
}

async function getLatestRevenueDateWithClient(client, storeId) {
  const result = await client.query(
    "SELECT business_date FROM revenue_daily_facts WHERE store_id = $1 ORDER BY business_date DESC LIMIT 1",
    [storeId],
  );
  return result.rows[0]?.business_date ?? null;
}

async function persistLiveContextResultWithClient(client, store, result = {}) {
  const persisted = {
    context_observation_count: 0,
    benchmark_count: 0,
    nearby_snapshot_count: 0,
    commercial_area_mapping_count: 0,
    store_location_updated: false,
  };

  if (result.store_location) {
    persisted.store_location_updated = await upsertStoreLocationFromCollectorWithClient(client, store, result.store_location);
  }

  for (const mapping of result.commercial_area_mappings || []) {
    if (await insertCommercialAreaMappingFromCollectorWithClient(client, store, mapping)) {
      persisted.commercial_area_mapping_count += 1;
    }
  }

  for (const observation of result.observations || []) {
    if (await insertContextObservationFromCollectorWithClient(client, store, observation)) {
      persisted.context_observation_count += 1;
    }
  }

  for (const benchmark of result.benchmarks || []) {
    if (await insertPublicBenchmarkFromCollectorWithClient(client, store, benchmark)) {
      persisted.benchmark_count += 1;
    }
  }

  for (const snapshot of result.nearby_store_snapshots || []) {
    if (await insertNearbyStoreSnapshotFromCollectorWithClient(client, store, snapshot)) {
      persisted.nearby_snapshot_count += 1;
    }
  }

  return persisted;
}

async function ensureContextSourceWithClient(client, source = {}) {
  const sourceId = text(source.source_id) || "public_context_unknown";
  await client.query(
    `
      INSERT INTO context_sources (
        source_id, source_name, source_type, provider, source_url,
        license_type, attribution, refresh_granularity, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT (source_id)
      DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_type = EXCLUDED.source_type,
        provider = COALESCE(EXCLUDED.provider, context_sources.provider),
        source_url = COALESCE(EXCLUDED.source_url, context_sources.source_url),
        updated_at = now()
    `,
    [
      sourceId,
      text(source.source_name) || sourceId,
      text(source.source_type) || text(source.context_type) || "manual_seed",
      text(source.provider) || null,
      text(source.source_url) || null,
      text(source.license_type) || null,
      text(source.attribution) || null,
      text(source.refresh_granularity) || "manual",
      JSON.stringify(safeObject(source.metadata)),
    ],
  );
  return sourceId;
}

async function insertContextObservationFromCollectorWithClient(client, store, observation = {}) {
  const sourceId = await ensureContextSourceWithClient(client, observation);
  const observationDate = text(observation.observation_date) || new Date().toISOString().slice(0, 10);
  const contextType = text(observation.context_type) || "manual_seed";
  const metricName = text(observation.metric_name) || "context_signal";
  const existing = await client.query(
    `
      SELECT observation_id
      FROM context_observations
      WHERE store_id = $1
        AND source_id = $2
        AND observation_date = $3::date
        AND context_type = $4
        AND metric_name = $5
        AND COALESCE(metric_value, -999999999) = COALESCE($6::numeric, -999999999)
      LIMIT 1
    `,
    [store.store_id, sourceId, observationDate, contextType, metricName, observation.metric_value ?? null],
  );
  const existingId = existing.rows[0]?.observation_id ?? null;
  if (existingId) {
    await linkObservationWithClient(client, store.store_id, existingId, linkTypeForContextType(contextType));
    return false;
  }
  const inserted = await client.query(
    `
      INSERT INTO context_observations (
        source_id, store_id, observation_date, observation_hour, context_type,
        metric_name, metric_value, metric_unit, label, region, raw_payload, observed_at
      )
      VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      RETURNING observation_id
    `,
    [
      sourceId,
      store.store_id,
      observationDate,
      observation.observation_hour ?? null,
      contextType,
      metricName,
      observation.metric_value ?? null,
      text(observation.metric_unit) || null,
      text(observation.label) || "공개 맥락 데이터가 함께 관측되었습니다. 인과가 확정된 것은 아닙니다.",
      text(observation.region) || store.region || null,
      JSON.stringify({
        source_ref: text(observation.source_ref) || null,
        metadata: safeObject(observation.metadata),
      }),
      observation.observed_at ?? null,
    ],
  );
  await linkObservationWithClient(client, store.store_id, inserted.rows[0].observation_id, linkTypeForContextType(contextType));
  return true;
}

async function linkObservationWithClient(client, storeId, observationId, linkType = "same_region") {
  await client.query(
    "INSERT INTO store_context_links (store_id, observation_id, link_type, strength) VALUES ($1,$2,$3,'medium') ON CONFLICT DO NOTHING",
    [storeId, observationId, linkType],
  );
}

async function upsertStoreLocationFromCollectorWithClient(client, store, location = {}) {
  const result = await client.query(
    `
      INSERT INTO store_locations (
        store_id, address_text, latitude, longitude, region, administrative_dong,
        legal_dong, geocode_provider, geocode_status, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      ON CONFLICT (store_id)
      DO UPDATE SET
        address_text = COALESCE(EXCLUDED.address_text, store_locations.address_text),
        latitude = COALESCE(EXCLUDED.latitude, store_locations.latitude),
        longitude = COALESCE(EXCLUDED.longitude, store_locations.longitude),
        region = COALESCE(EXCLUDED.region, store_locations.region),
        administrative_dong = COALESCE(EXCLUDED.administrative_dong, store_locations.administrative_dong),
        legal_dong = COALESCE(EXCLUDED.legal_dong, store_locations.legal_dong),
        geocode_provider = COALESCE(EXCLUDED.geocode_provider, store_locations.geocode_provider),
        geocode_status = EXCLUDED.geocode_status,
        metadata = store_locations.metadata || EXCLUDED.metadata,
        updated_at = now()
      RETURNING store_id
    `,
    [
      store.store_id,
      text(location.address_text) || store.address_text || null,
      location.latitude ?? null,
      location.longitude ?? null,
      text(location.region) || store.region || null,
      text(location.administrative_dong) || null,
      text(location.legal_dong) || null,
      text(location.geocode_provider) || null,
      text(location.geocode_status) || "pending",
      JSON.stringify(safeObject(location.metadata)),
    ],
  );
  return Boolean(result.rows[0]);
}

async function insertCommercialAreaMappingFromCollectorWithClient(client, store, mapping = {}) {
  const existing = await client.query(
    `
      SELECT 1
      FROM commercial_area_mappings
      WHERE store_id = $1
        AND COALESCE(commercial_area_code, '') = COALESCE($2, '')
        AND COALESCE(commercial_area_name, '') = COALESCE($3, '')
        AND mapping_method = $4
      LIMIT 1
    `,
    [
      store.store_id,
      text(mapping.commercial_area_code) || null,
      text(mapping.commercial_area_name) || null,
      text(mapping.mapping_method) || "future_api",
    ],
  );
  if (existing.rows[0]) return false;
  await client.query(
    `
      INSERT INTO commercial_area_mappings (
        store_id, commercial_area_code, commercial_area_name, administrative_dong,
        business_category, mapping_method, confidence, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    `,
    [
      store.store_id,
      text(mapping.commercial_area_code) || null,
      text(mapping.commercial_area_name) || null,
      text(mapping.administrative_dong) || null,
      text(mapping.business_category) || store.business_category || null,
      text(mapping.mapping_method) || "future_api",
      text(mapping.confidence) || "weak",
      JSON.stringify(safeObject(mapping.metadata)),
    ],
  );
  return true;
}

async function insertPublicBenchmarkFromCollectorWithClient(client, store, benchmark = {}) {
  const sourceId = await ensureContextSourceWithClient(client, benchmark);
  const periodStart = text(benchmark.period_start) || new Date().toISOString().slice(0, 10);
  const existing = await client.query(
    `
      SELECT 1
      FROM public_revenue_benchmarks
      WHERE source_id = $1
        AND COALESCE(region, '') = COALESCE($2, '')
        AND COALESCE(business_category, '') = COALESCE($3, '')
        AND COALESCE(commercial_area_code, '') = COALESCE($4, '')
        AND period_start = $5::date
      LIMIT 1
    `,
    [
      sourceId,
      text(benchmark.region) || store.region || null,
      text(benchmark.business_category) || store.business_category || null,
      text(benchmark.commercial_area_code) || null,
      periodStart,
    ],
  );
  if (existing.rows[0]) return false;
  await client.query(
    `
      INSERT INTO public_revenue_benchmarks (
        source_id, region, commercial_area_code, business_category, period_start,
        period_end, sales_amount, transaction_count, avg_transaction_value, metadata
      )
      VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10::jsonb)
    `,
    [
      sourceId,
      text(benchmark.region) || store.region || null,
      text(benchmark.commercial_area_code) || null,
      text(benchmark.business_category) || store.business_category || null,
      periodStart,
      text(benchmark.period_end) || periodStart,
      benchmark.sales_amount ?? null,
      benchmark.transaction_count ?? null,
      benchmark.avg_transaction_value ?? null,
      JSON.stringify({
        ...safeObject(benchmark.metadata),
        source_ref: text(benchmark.source_ref) || null,
      }),
    ],
  );
  return true;
}

async function insertNearbyStoreSnapshotFromCollectorWithClient(client, store, snapshot = {}) {
  const sourceId = await ensureContextSourceWithClient(client, snapshot);
  const snapshotDate = text(snapshot.snapshot_date) || new Date().toISOString().slice(0, 10);
  const radius = Number(snapshot.radius_m) || 500;
  const existing = await client.query(
    `
      SELECT 1
      FROM nearby_store_snapshots
      WHERE store_id = $1
        AND snapshot_date = $2::date
        AND radius_m = $3
        AND COALESCE(source_id, '') = COALESCE($4, '')
      LIMIT 1
    `,
    [store.store_id, snapshotDate, radius, sourceId],
  );
  if (existing.rows[0]) return false;
  await client.query(
    `
      INSERT INTO nearby_store_snapshots (
        store_id, snapshot_date, radius_m, business_category,
        same_category_store_count, total_store_count, source_id, metadata
      )
      VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8::jsonb)
    `,
    [
      store.store_id,
      snapshotDate,
      radius,
      text(snapshot.business_category) || store.business_category || null,
      snapshot.same_category_store_count ?? null,
      snapshot.total_store_count ?? null,
      sourceId,
      JSON.stringify({
        ...safeObject(snapshot.metadata),
        source_ref: text(snapshot.source_ref) || null,
      }),
    ],
  );
  return true;
}

function linkTypeForContextType(contextType) {
  if (["benchmark", "competition", "foot_traffic", "nearby_competitor_search"].includes(contextType)) return "commercial_area";
  if (["geocoding", "weather", "calendar", "search_trend"].includes(contextType)) return "same_region";
  return "same_region";
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
    holiday_flag: Boolean(byMetric.get("holiday_or_special_day")),
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
