const test = require("node:test");
const assert = require("node:assert/strict");

const { previewRevenueUploadPayload } = require("./revenue-upload-parsers");

test("standard daily CSV parser previews accepted and rejected rows", () => {
  const preview = previewRevenueUploadPayload({
    parser_type: "standard_daily_revenue_csv",
    csv_text: [
      "business_date,channel,gross_sales_amount,net_sales_amount,order_count",
      "2026-05-01,offline_pos,1250000,1180000,82",
      "bad-date,offline_pos,1000,900,1",
    ].join("\n"),
  });

  assert.equal(preview.quality_summary.accepted_count, 1);
  assert.equal(preview.quality_summary.rejected_count, 1);
  assert.equal(preview.daily_rows[0].business_date, "2026-05-01");
});

test("Toss-style product order CSV maps item rows", () => {
  const preview = previewRevenueUploadPayload({
    parser_type: "toss_style_product_orders_csv",
    csv_text: [
      "order_date,product_name,product_category,quantity,gross_amount,net_amount",
      "2026-05-01,아메리카노,coffee,41,184500,184500",
    ].join("\n"),
  });

  assert.equal(preview.quality_summary.accepted_count, 1);
  assert.equal(preview.item_rows[0].item_name, "아메리카노");
  assert.equal(preview.item_rows[0].quantity, 41);
});
