#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const FIXTURE_PATH = path.join(REPO_ROOT, "apps", "api", "src", "revenue-ops", "data", "m6_demo_revenue_dataset.json");

const START_DATE_UTC = Date.UTC(2026, 2, 2);
const DAY_MS = 86400000;
const DAY_COUNT = 70;

const STORE_PROFILES = [
  {
    demo_scenario: "seongsu_cafe_dessert",
    store_name: "성수 카페 / 디저트",
    tenant_name: "M6 Demo · Seongsu Cafe",
    address_text: "서울 성동구 성수이로 87",
    region: "서울 성동구 성수동",
    business_category: "cafe",
    channel: "offline_pos",
    base_orders: 96,
    weekend_factor: 1.22,
    weekday_ticket: 9400,
    weekend_ticket: 10800,
    narrative: "rainy days, walk-in softness, nearby competition",
  },
  {
    demo_scenario: "gangnam_lunch_salad",
    store_name: "강남 점심 샐러드/도시락",
    tenant_name: "M6 Demo · Gangnam Lunch",
    address_text: "서울 강남구 테헤란로 152",
    region: "서울 강남구 역삼동",
    business_category: "lunch_food",
    channel: "offline_pos",
    base_orders: 142,
    weekend_factor: 0.52,
    weekday_ticket: 11800,
    weekend_ticket: 12100,
    narrative: "office lunch concentration, weekday demand sensitivity",
  },
  {
    demo_scenario: "yeonnam_hongdae_dessert",
    store_name: "연남/홍대 디저트 카페",
    tenant_name: "M6 Demo · Yeonnam Dessert",
    address_text: "서울 마포구 양화로 188",
    region: "서울 마포구 동교동",
    business_category: "dessert_cafe",
    channel: "offline_pos",
    base_orders: 92,
    weekend_factor: 1.42,
    weekday_ticket: 10300,
    weekend_ticket: 12200,
    narrative: "weekend leisure/search trend sensitivity",
  },
  {
    demo_scenario: "yeouido_office_cafe",
    store_name: "여의도 직장인 카페",
    tenant_name: "M6 Demo · Yeouido Office Cafe",
    address_text: "서울 영등포구 국제금융로 10",
    region: "서울 영등포구 여의도동",
    business_category: "cafe",
    channel: "offline_pos",
    base_orders: 128,
    weekend_factor: 0.46,
    weekday_ticket: 8700,
    weekend_ticket: 9100,
    narrative: "weekday office demand, holiday dips",
  },
  {
    demo_scenario: "jamsil_chicken_delivery",
    store_name: "잠실 치킨/배달 매장",
    tenant_name: "M6 Demo · Jamsil Chicken",
    address_text: "서울 송파구 올림픽로 300",
    region: "서울 송파구 잠실동",
    business_category: "chicken_delivery",
    channel: "delivery_baemin",
    base_orders: 112,
    weekend_factor: 1.36,
    weekday_ticket: 22600,
    weekend_ticket: 24400,
    narrative: "delivery/weekend/event demand",
  },
  {
    demo_scenario: "sinchon_casual_food",
    store_name: "신촌 분식/간편식",
    tenant_name: "M6 Demo · Sinchon Casual Food",
    address_text: "서울 서대문구 연세로 50",
    region: "서울 서대문구 신촌동",
    business_category: "casual_food",
    channel: "offline_pos",
    base_orders: 124,
    weekend_factor: 0.84,
    weekday_ticket: 7800,
    weekend_ticket: 8200,
    narrative: "student traffic/calendar fluctuation",
  },
];

function dateAt(offset) {
  return new Date(START_DATE_UTC + offset * DAY_MS).toISOString().slice(0, 10);
}

function anomalyFactor(profile, day, dow) {
  const scenario = profile.demo_scenario;
  if (scenario === "seongsu_cafe_dessert" && [17, 25, 33, 41].includes(day)) return 0.78;
  if (scenario === "gangnam_lunch_salad" && (dow === 1 || dow === 5) && day >= 36 && day <= 49) return 0.9;
  if (scenario === "yeonnam_hongdae_dessert" && dow === 6 && day >= 28 && day <= 42) return 1.18;
  if (scenario === "yeouido_office_cafe" && [29, 30, 31].includes(day)) return 0.58;
  if (scenario === "jamsil_chicken_delivery" && (dow === 5 || dow === 6) && day >= 44 && day <= 58) return 1.22;
  if (scenario === "sinchon_casual_food" && day >= 35 && day <= 48) return 0.84;
  return 1;
}

function buildRows(profile) {
  const rows = [];
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const date = new Date(START_DATE_UTC + day * DAY_MS);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const weekdayCurve = weekend ? profile.weekend_factor : 1;
    const trend = 1 + ((day - 35) * 0.0018);
    const weeklyNoise = (((day * 13) % 19) - 9) / 100;
    const factor = weekdayCurve * trend * anomalyFactor(profile, day, dow);
    const orderCount = Math.max(12, Math.round(profile.base_orders * factor * (1 + weeklyNoise)));
    const averageTicket = Math.round((weekend ? profile.weekend_ticket : profile.weekday_ticket) + ((day * 151) % 1100) - 420);
    const gross = Math.max(0, Math.round(orderCount * averageTicket));
    const discount = Math.round(gross * (profile.channel.startsWith("delivery") ? 0.035 : 0.022));
    const refund = Math.round(gross * (0.004 + ((day % 4) * 0.0015)));
    const net = gross - discount - refund;
    rows.push({
      business_date: dateAt(day),
      channel: profile.channel,
      gross_sales_amount: gross,
      net_sales_amount: net,
      order_count: orderCount,
      transaction_count: orderCount,
      average_ticket: averageTicket,
      cancel_count: Math.max(0, Math.round(orderCount * 0.012)),
      refund_amount: refund,
      discount_amount: discount,
      delivery_fee_amount: profile.channel.startsWith("delivery") ? Math.round(orderCount * 2900) : 0,
      commission_amount: profile.channel.startsWith("delivery") ? Math.round(gross * 0.075) : 0,
      payment_card_amount: Math.round(net * 0.86),
      payment_cash_amount: profile.channel.startsWith("delivery") ? 0 : Math.round(net * 0.06),
    });
  }
  return rows;
}

function buildDataset() {
  return {
    generated_for: "m6_presentation",
    is_synthetic: true,
    synthetic_notice: "Synthetic, plausible demo data. Not real merchant data.",
    date_range: {
      start: dateAt(0),
      end: dateAt(DAY_COUNT - 1),
      day_count: DAY_COUNT,
    },
    stores: STORE_PROFILES.map((profile) => ({
      ...profile,
      store_type: "demo",
      tenant_type: "demo",
      metadata: {
        is_demo: true,
        demo_scenario: profile.demo_scenario,
        generated_for: "m6_presentation",
        synthetic_notice: "Synthetic plausible revenue data. Not real merchant data.",
        narrative: profile.narrative,
      },
      revenue_daily_rows: buildRows(profile),
    })),
  };
}

async function seedViaApi({ apiBase, idToken, dataset }) {
  const base = apiBase.replace(/\/+$/, "");
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${idToken}`,
  };
  const results = [];
  for (const store of dataset.stores) {
    const created = await fetch(`${base}/api/v1/stores`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        store_name: store.store_name,
        tenant_name: store.tenant_name,
        tenant_type: "demo",
        store_type: "demo",
        business_category: store.business_category,
        region: store.region,
        address_text: store.address_text,
        metadata: store.metadata,
      }),
    });
    if (!created.ok) throw new Error(`store create failed: ${created.status}`);
    const createdBody = await created.json();
    const storeId = createdBody.store.store_id;
    const uploaded = await fetch(`${base}/api/v1/stores/${encodeURIComponent(storeId)}/revenue/uploads`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source_type: "m6_synthetic_demo_seed",
        original_filename: `${store.demo_scenario}.json`,
        daily_rows: store.revenue_daily_rows,
        metadata: store.metadata,
      }),
    });
    if (!uploaded.ok) throw new Error(`revenue upload failed for ${store.store_name}: ${uploaded.status}`);
    const uploadedBody = await uploaded.json();
    results.push({
      store_name: store.store_name,
      store_id: storeId,
      accepted_count: uploadedBody.upload?.accepted_count ?? uploadedBody.accepted_count,
      rejected_count: uploadedBody.upload?.rejected_count ?? uploadedBody.rejected_count,
    });
  }
  return results;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--api-base") args.apiBase = argv[index += 1];
    else if (item === "--id-token") args.idToken = argv[index += 1];
    else if (item === "--fixture") args.fixture = argv[index += 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = buildDataset();
  const fixturePath = args.fixture ? path.resolve(args.fixture) : FIXTURE_PATH;
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, `${JSON.stringify(dataset, null, 2)}\n`);
  process.stdout.write(`Wrote ${fixturePath}\n`);

  if (args.apiBase || args.idToken) {
    if (!args.apiBase || !args.idToken) {
      throw new Error("--api-base and --id-token must be provided together");
    }
    const results = await seedViaApi({ apiBase: args.apiBase, idToken: args.idToken, dataset });
    process.stdout.write(`${JSON.stringify({ seeded: results }, null, 2)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
