#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "data", "seed", "step3");

const notice = "This is not real individual store revenue. It is realistic synthetic POS data calibrated by public commercial-district benchmark assumptions.";
const store = {
  store_name: "성수 커피음료 매장",
  tenant_name: "Demo Merchant Tenant",
  business_category: "cafe",
  region: "Seoul Seongsu",
  address_text: "서울 성동구 성수동 일대",
  timezone: "Asia/Seoul",
  synthetic_notice: notice,
  location_seed: {
    latitude: 37.5446,
    longitude: 127.0557,
    exact_location_claim: false,
  },
};

const products = [
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

function dailyRows() {
  const rows = [];
  const start = Date.UTC(2026, 2, 1);
  for (let day = 0; day < 75; day += 1) {
    const date = new Date(start + day * 86400000);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 5 || dow === 6;
    const monday = dow === 1;
    const anomaly = day >= 45 && day <= 51;
    const rainDrop = anomaly ? 0.82 : 1;
    const promoLift = day >= 58 && day <= 64 ? 1.11 : 1;
    const hotLift = day >= 65 ? 1.05 : 1;
    const orders = Math.round(((weekend ? 126 : monday ? 78 : 96) + ((day * 7) % 13) - 6) * rainDrop * promoLift);
    const aov = (weekend ? 10200 : monday ? 8600 : 9200) + ((day * 113) % 900);
    const gross = Math.round(orders * aov * hotLift);
    const refund = Math.round(gross * (0.006 + ((day % 5) * 0.002)));
    const discount = Math.round(gross * (promoLift > 1 ? 0.06 : 0.025));
    const net = gross - refund - discount;
    rows.push({
      business_date: date.toISOString().slice(0, 10),
      channel: "offline_pos",
      gross_sales_amount: gross,
      net_sales_amount: net,
      order_count: orders,
      cancel_count: Math.max(0, Math.round(orders * 0.01)),
      refund_amount: refund,
      discount_amount: discount,
      payment_card_amount: Math.round(net * 0.88),
      payment_cash_amount: Math.round(net * 0.05),
      payment_simple_amount: Math.round(net * 0.07),
      pattern_note: anomaly ? "rain_day_visible_anomaly" : promoLift > 1 ? "promotion_period" : hotLift > 1 ? "hot_day_iced_lift" : "",
    });
  }
  return rows;
}

function itemRows(daily) {
  return daily.flatMap((row, index) => {
    const anomalyFactor = index >= 45 && index <= 51 ? 0.85 : 1;
    return products.map(([item_name, item_category, share, price]) => {
      const quantity = Math.max(1, Math.round(row.order_count * share * (item_category === "bakery" ? anomalyFactor : 1)));
      const gross = quantity * price;
      return {
        business_date: row.business_date,
        channel: "offline_pos",
        item_name,
        item_category,
        quantity,
        gross_sales_amount: gross,
        discount_amount: Math.round(gross * 0.02),
        net_sales_amount: Math.round(gross * 0.98),
      };
    });
  });
}

function contextRows() {
  return [
    ["2026-04-15", "weather", "rainfall_mm", 22, "mm", "Rain signal observed together with lower offline orders"],
    ["2026-04-16", "weather", "rainfall_mm", 38, "mm", "Rain-day offline drop candidate cause; requires additional confirmation"],
    ["2026-04-17", "foot_traffic", "foot_traffic_proxy_delta_pct", -14, "pct", "Foot traffic proxy softened during revenue drop window"],
    ["2026-04-18", "benchmark", "commercial_area_sales_delta_pct", -8, "pct", "Commercial district benchmark downturn observed together"],
    ["2026-04-20", "event", "local_popup_event_count", 2, "count", "Nearby popup/event activity may change visit patterns"],
    ["2026-05-03", "holiday", "weekend_or_holiday", 1, "boolean", "Weekend/holiday label for comparison"],
    ["2026-05-08", "competition", "same_category_store_count", 61, "stores", "Nearby same-category density is a context signal, not proven causality"],
  ].map(([observation_date, context_type, metric_name, metric_value, metric_unit, label]) => ({
    observation_date,
    source_id: `manual_seed_${context_type}`,
    context_type,
    metric_name,
    metric_value,
    metric_unit,
    label,
    region: "Seoul Seongsu",
  }));
}

function csv(rows) {
  const columns = Object.keys(rows[0] ?? {});
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(",")),
  ].join("\n") + "\n";
}

function escapeCsv(value) {
  const text = value === null || typeof value === "undefined" ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

fs.mkdirSync(outDir, { recursive: true });
const daily = dailyRows();
const items = itemRows(daily);
const context = contextRows();

fs.writeFileSync(path.join(outDir, "seongsu_cafe_store.json"), `${JSON.stringify(store, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "seongsu_cafe_daily_revenue.csv"), csv(daily));
fs.writeFileSync(path.join(outDir, "seongsu_cafe_item_revenue.csv"), csv(items));
fs.writeFileSync(path.join(outDir, "seongsu_cafe_payments_toss_style.csv"), csv(daily.map((row) => ({
  payment_date: row.business_date,
  gross_amount: row.gross_sales_amount,
  card_amount: row.payment_card_amount,
  cash_amount: row.payment_cash_amount,
  simple_pay_amount: row.payment_simple_amount,
  refund_amount: row.refund_amount,
  discount_amount: row.discount_amount,
}))));
fs.writeFileSync(path.join(outDir, "seongsu_cafe_product_orders_toss_style.csv"), csv(items.map((row) => ({
  order_date: row.business_date,
  product_name: row.item_name,
  product_category: row.item_category,
  quantity: row.quantity,
  gross_amount: row.gross_sales_amount,
  net_amount: row.net_sales_amount,
}))));
fs.writeFileSync(path.join(outDir, "seongsu_cafe_context_observations.csv"), csv(context));
fs.writeFileSync(path.join(outDir, "seongsu_cafe_expected_briefs.json"), `${JSON.stringify({
  synthetic_notice: notice,
  headline: "성수 커피음료 매장: 매출 하락과 비/유동인구 프록시 하락이 함께 관측되었습니다",
  summary: "가능성 높은 원인 후보가 있으나 인과가 확정된 것은 아닙니다. 실행 전 추가 확인이 필요합니다.",
  reliability_note: "이 분석은 업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 인과가 확정된 것은 아니며, 실행 전 추가 확인이 필요합니다.",
}, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "seongsu_cafe_expected_actions.json"), `${JSON.stringify({
  synthetic_notice: notice,
  actions: [
    {
      action_family: "rainy_day_delivery_boost",
      title: "비 오는 날 배달/포장 세트 메뉴를 테스트하세요",
      caution: "효과가 보장되지 않으며 인과가 확정된 것은 아닙니다.",
    },
    {
      action_family: "bundle_attach_rate_recovery",
      title: "커피+디저트 세트 구성을 테스트하세요",
      caution: "추가 확인이 필요합니다.",
    },
  ],
}, null, 2)}\n`);

process.stdout.write(`Generated STEP 3 seed data in ${path.relative(repoRoot, outDir)}\n`);
