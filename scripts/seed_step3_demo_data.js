#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const seedDir = path.join(repoRoot, "data", "seed", "step3");
const ddlPath = path.join(repoRoot, "infra", "db", "revenue_ops_step3_4_lite.sql");
const databaseUrl = process.env.AURORA_DATABASE_URL || process.env.DATABASE_URL || "";

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(seedDir, name), "utf8"));
}

function readCsv(name) {
  const text = fs.readFileSync(path.join(seedDir, name), "utf8").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

async function main() {
  const store = readJson("seongsu_cafe_store.json");
  const dailyRows = readCsv("seongsu_cafe_daily_revenue.csv");
  const itemRows = readCsv("seongsu_cafe_item_revenue.csv");
  const contextRows = readCsv("seongsu_cafe_context_observations.csv");

  if (!databaseUrl) {
    process.stdout.write(JSON.stringify({
      status: "skipped",
      reason: "DATABASE_URL or AURORA_DATABASE_URL is not set",
      seed_files_loaded: {
        daily_rows: dailyRows.length,
        item_rows: itemRows.length,
        context_rows: contextRows.length,
      },
    }, null, 2) + "\n");
    return;
  }

  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });

  try {
    await pool.query(fs.readFileSync(ddlPath, "utf8"));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await upsertSeedUser(client);
      const tenant = await findOrCreateTenant(client, user.app_user_id, store);
      const createdStore = await findOrCreateStore(client, user.app_user_id, tenant.tenant_id, store);
      await ensureMemberships(client, tenant.tenant_id, createdStore.store_id, user.app_user_id);
      const upload = await findOrCreateUpload(client, createdStore.store_id, user.app_user_id, dailyRows.length + itemRows.length);
      const dailyInserted = await insertDailyFacts(client, createdStore.store_id, upload.upload_id, dailyRows);
      const itemInserted = await insertItemFacts(client, createdStore.store_id, upload.upload_id, itemRows);
      const contextInserted = await insertContextRows(client, createdStore.store_id, contextRows);
      await client.query("COMMIT");
      process.stdout.write(JSON.stringify({
        status: "completed",
        store_id: createdStore.store_id,
        upload_id: upload.upload_id,
        daily_rows_inserted: dailyInserted,
        item_rows_inserted: itemInserted,
        context_rows_inserted: contextInserted,
      }, null, 2) + "\n");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function upsertSeedUser(client) {
  const result = await client.query(`
    INSERT INTO app_users (cognito_sub, email, display_name, last_login_at, updated_at)
    VALUES ('seed-step3-demo-user', 'seed-step3@example.invalid', 'STEP 3 Seed User', now(), now())
    ON CONFLICT (cognito_sub)
    DO UPDATE SET last_login_at = now(), updated_at = now()
    RETURNING app_user_id
  `);
  return result.rows[0];
}

async function findOrCreateTenant(client, appUserId, store) {
  const existing = await client.query("SELECT tenant_id FROM tenants WHERE tenant_name = $1 AND tenant_type = 'demo' LIMIT 1", [store.tenant_name]);
  if (existing.rows[0]) return existing.rows[0];
  const result = await client.query(
    "INSERT INTO tenants (tenant_name, tenant_type, created_by) VALUES ($1, 'demo', $2) RETURNING tenant_id",
    [store.tenant_name, appUserId],
  );
  return result.rows[0];
}

async function findOrCreateStore(client, appUserId, tenantId, store) {
  const existing = await client.query("SELECT store_id FROM stores WHERE tenant_id = $1 AND store_name = $2 LIMIT 1", [tenantId, store.store_name]);
  if (existing.rows[0]) return existing.rows[0];
  const result = await client.query(
    `
      INSERT INTO stores (tenant_id, store_name, store_type, business_category, region, address_text, timezone, metadata, created_by)
      VALUES ($1, $2, 'demo', $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING store_id
    `,
    [tenantId, store.store_name, store.business_category, store.region, store.address_text, store.timezone, JSON.stringify({ synthetic_notice: store.synthetic_notice }), appUserId],
  );
  await client.query(
    `
      INSERT INTO store_locations (store_id, address_text, latitude, longitude, region, administrative_dong, legal_dong, geocode_provider, geocode_status, metadata)
      VALUES ($1, $2, $3, $4, $5, 'Seongsu-dong', 'Seongsu-dong', 'manual_seed', 'manual_seed', '{"exact_location_claim": false}'::jsonb)
      ON CONFLICT (store_id) DO NOTHING
    `,
    [result.rows[0].store_id, store.address_text, store.location_seed.latitude, store.location_seed.longitude, store.region],
  );
  return result.rows[0];
}

async function ensureMemberships(client, tenantId, storeId, appUserId) {
  await client.query(
    "INSERT INTO tenant_members (tenant_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (tenant_id, app_user_id) DO NOTHING",
    [tenantId, appUserId],
  );
  await client.query(
    "INSERT INTO store_members (store_id, app_user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (store_id, app_user_id) DO NOTHING",
    [storeId, appUserId],
  );
}

async function findOrCreateUpload(client, storeId, appUserId, rowCount) {
  const existing = await client.query(
    "SELECT upload_id FROM revenue_uploads WHERE store_id = $1 AND source_type = 'synthetic_seed' AND original_filename = 'seongsu_cafe_daily_revenue.csv' LIMIT 1",
    [storeId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const result = await client.query(
    `
      INSERT INTO revenue_uploads (store_id, uploaded_by, source_type, original_filename, file_type, status, row_count, accepted_count, rejected_count, metadata)
      VALUES ($1, $2, 'synthetic_seed', 'seongsu_cafe_daily_revenue.csv', 'csv', 'accepted', $3, $3, 0, '{"synthetic_seed": true}'::jsonb)
      RETURNING upload_id
    `,
    [storeId, appUserId, rowCount],
  );
  return result.rows[0];
}

async function insertDailyFacts(client, storeId, uploadId, rows) {
  let inserted = 0;
  for (const row of rows) {
    const result = await client.query(
      `
        INSERT INTO revenue_daily_facts (
          store_id, business_date, channel, gross_sales_amount, net_sales_amount, order_count,
          cancel_count, refund_amount, discount_amount, payment_card_amount, payment_cash_amount, source_upload_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (store_id, business_date, channel, source_upload_id) DO NOTHING
      `,
      [storeId, row.business_date, row.channel, row.gross_sales_amount, row.net_sales_amount, row.order_count, row.cancel_count, row.refund_amount, row.discount_amount, row.payment_card_amount, row.payment_cash_amount, uploadId],
    );
    inserted += result.rowCount;
  }
  return inserted;
}

async function insertItemFacts(client, storeId, uploadId, rows) {
  const existing = await client.query("SELECT 1 FROM revenue_item_facts WHERE source_upload_id = $1 LIMIT 1", [uploadId]);
  if (existing.rows[0]) return 0;
  let inserted = 0;
  for (const row of rows) {
    const result = await client.query(
      `
        INSERT INTO revenue_item_facts (
          store_id, business_date, channel, item_name, item_category, quantity,
          gross_sales_amount, discount_amount, net_sales_amount, source_upload_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [storeId, row.business_date, row.channel, row.item_name, row.item_category, row.quantity, row.gross_sales_amount, row.discount_amount, row.net_sales_amount, uploadId],
    );
    inserted += result.rowCount;
  }
  return inserted;
}

async function insertContextRows(client, storeId, rows) {
  let inserted = 0;
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO context_sources (source_id, source_name, source_type, provider, attribution, refresh_granularity)
        VALUES ($1, $2, $3, 'manual_seed', 'Synthetic public context seed for STEP 3 validation', 'seed')
        ON CONFLICT (source_id) DO NOTHING
      `,
      [row.source_id, row.source_id, row.context_type],
    );
    const exists = await client.query(
      `
        SELECT 1 FROM context_observations
        WHERE store_id = $1 AND observation_date = $2 AND context_type = $3 AND metric_name = $4
        LIMIT 1
      `,
      [storeId, row.observation_date, row.context_type, row.metric_name],
    );
    if (exists.rows[0]) continue;
    const result = await client.query(
      `
        INSERT INTO context_observations (
          source_id, store_id, observation_date, context_type, metric_name,
          metric_value, metric_unit, label, region, raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::numeric, $7, $8, $9, '{}'::jsonb)
        RETURNING observation_id
      `,
      [row.source_id, storeId, row.observation_date, row.context_type, row.metric_name, row.metric_value, row.metric_unit, row.label, row.region],
    );
    await client.query(
      "INSERT INTO store_context_links (store_id, observation_id, link_type, strength) VALUES ($1, $2, 'manual_seed', 'medium') ON CONFLICT DO NOTHING",
      [storeId, result.rows[0].observation_id],
    );
    inserted += 1;
  }
  return inserted;
}

main().catch((error) => {
  process.stderr.write(`STEP 3 seed failed: ${error.message}\n`);
  process.exitCode = 1;
});
