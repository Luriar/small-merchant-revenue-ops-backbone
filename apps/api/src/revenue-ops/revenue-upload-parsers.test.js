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

test("delivery CSV parser normalizes Baemin/CoupangEats settlement fields without login credentials", () => {
  const preview = previewRevenueUploadPayload({
    source_type: "baemin_orders_csv",
    csv_text: [
      "주문일,총 결제금액,정산금액,주문수,취소건수,배달비,중개수수료",
      "2026.05.01,\"128,000\",\"104,000\",12,1,\"18,000\",\"6,000\"",
    ].join("\n"),
  });

  assert.equal(preview.parser_type, "baemin_orders_csv");
  assert.equal(preview.quality_summary.accepted_count, 1);
  assert.equal(preview.daily_rows[0].channel, "delivery_baemin");
  assert.equal(preview.daily_rows[0].business_date, "2026-05-01");
  assert.equal(preview.daily_rows[0].gross_sales_amount, 128000);
  assert.equal(preview.daily_rows[0].delivery_fee_amount, 18000);
  assert.equal(preview.daily_rows[0].commission_amount, 6000);
  assert.equal(preview.daily_rows[0].settlement_amount, 104000);
  assert.equal(preview.daily_rows[0].source_file_type, "baemin_orders_csv");
});
