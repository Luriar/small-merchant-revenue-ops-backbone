const test = require("node:test");
const assert = require("node:assert/strict");

const { composeBriefFromUploadedFacts } = require("./revenue-ops-saas-store");

test("composeBriefFromUploadedFacts normalizes Date business_date values to YYYY-MM-DD", () => {
  const brief = composeBriefFromUploadedFacts({
    storeId: "store_date_normalization",
    store: {
      store_name: "날짜 정규화 테스트 매장",
      region: "서울",
      business_category: "CS100010",
    },
    latestUpload: {
      upload_id: "upload_date_normalization",
    },
    facts: [
      {
        business_date: new Date("2026-05-08T00:00:00.000Z"),
        net_sales_amount: 300000,
        order_count: 30,
      },
      {
        business_date: "Fri Apr 03 2026 00:00:00 GMT+0000 (Coordinated Universal Time)",
        net_sales_amount: 200000,
        order_count: 20,
      },
      {
        business_date: "2026-02-08",
        net_sales_amount: 100000,
        order_count: 10,
      },
    ],
  });

  assert.ok(brief);
  assert.equal(brief.period_label, "2026-02-08 ~ 2026-05-08");
  assert.equal(brief.period_start, "2026-02-08");
  assert.equal(brief.period_end, "2026-05-08");
  assert.equal(brief.revenue_summary.days_in_period, 3);
  assert.deepEqual(
    brief.daily_series.map((point) => point.date),
    ["2026-02-08", "2026-04-03", "2026-05-08"],
  );
  assert.equal(brief.daily_series[0].net_sales, 100000);
  assert.equal(brief.daily_series[2].order_count, 30);
});
