const DAILY_ALIASES = {
  business_date: ["business_date", "date", "payment_date", "order_date", "영업일", "영업일자", "일자", "날짜", "결제일", "결제일자", "주문일", "주문일자", "매출일자"],
  channel: ["channel", "sales_channel", "판매채널", "채널"],
  gross_sales_amount: ["gross_sales_amount", "gross_amount", "sales_amount", "sale_amount", "총매출", "총매출액", "매출", "매출액", "총 결제금액", "총 결제 금액", "결제금액", "결제 금액", "매출금액", "판매금액"],
  net_sales_amount: ["net_sales_amount", "net_amount", "settlement_amount", "순매출", "순매출액", "실매출", "실매출액", "정산금액", "정산 금액", "입금예정금액", "입금예정액"],
  order_count: ["order_count", "orders", "transaction_count", "payment_count", "주문수", "주문 건수", "주문건수", "주문건수", "거래수", "거래건수", "건수", "결제건수", "판매건수"],
  cancel_count: ["cancel_count", "cancellation_count", "cancellations", "취소수", "취소 건수", "취소건수"],
  cancellation_count: ["cancellation_count", "cancel_count", "cancellations", "취소수", "취소 건수", "취소건수"],
  refund_amount: ["refund_amount", "refunds", "환불금액", "환불 금액"],
  discount_amount: ["discount_amount", "discounts", "할인금액", "할인 금액"],
  delivery_fee_amount: ["delivery_fee_amount", "delivery_fee", "배달비", "배달팁", "배달료"],
  commission_amount: ["commission_amount", "commission", "중개수수료", "수수료"],
  settlement_amount: ["settlement_amount", "settlement", "정산금액", "입금예정금액"],
  payment_card_amount: ["payment_card_amount", "card_amount", "카드금액"],
  payment_cash_amount: ["payment_cash_amount", "cash_amount", "현금금액"],
  source_file_type: ["source_file_type", "file_type", "파일유형"],
  source_row_number: ["source_row_number", "row_number", "행번호"],
};

const ITEM_ALIASES = {
  business_date: ["business_date", "date", "order_date", "payment_date", "영업일", "일자", "주문일"],
  channel: ["channel", "sales_channel", "채널"],
  item_name: ["item_name", "product_name", "menu_name", "item", "product", "menu", "상품명", "메뉴명", "품목명"],
  item_category: ["item_category", "category", "product_category", "menu_category", "상품분류", "상품 분류", "메뉴분류", "카테고리"],
  quantity: ["quantity", "qty", "수량"],
  gross_sales_amount: ["gross_sales_amount", "gross_amount", "sales_amount", "총매출", "결제금액"],
  discount_amount: ["discount_amount", "discounts", "할인금액", "할인 금액"],
  net_sales_amount: ["net_sales_amount", "net_amount", "settlement_amount", "순매출", "순매출액", "실매출", "실매출액", "정산금액", "정산 금액", "입금예정금액", "입금예정액"],
};

const DELIVERY_SOURCE_TYPES = [
  "baemin_orders_csv",
  "baemin_settlement_xlsx",
  "coupangeats_orders_csv",
  "coupangeats_settlement_xlsx",
  "delivery_provider_normalized",
];

const DELIVERY_CHANNEL_BY_SOURCE_TYPE = {
  baemin_orders_csv: "delivery_baemin",
  baemin_settlement_xlsx: "delivery_baemin",
  coupangeats_orders_csv: "delivery_coupangeats",
  coupangeats_settlement_xlsx: "delivery_coupangeats",
  delivery_provider_normalized: "delivery_provider",
};

function previewRevenueUploadPayload(payload = {}) {
  const parserType = text(payload.parser_type) || inferParserType(payload);
  const sourceType = text(payload.source_type) || parserType || "manual_template";
  const parsed = parsePayloadByType(payload, parserType, sourceType);
  const dailyRows = parsed.daily_rows.map((row, index) => normalizePreviewRow("daily", row, index));
  const itemRows = parsed.item_rows.map((row, index) => normalizePreviewRow("item", row, index));
  const acceptedDailyRows = dailyRows.filter((row) => row.ok).map((row) => row.value);
  const acceptedItemRows = itemRows.filter((row) => row.ok).map((row) => row.value);
  const rejectedRows = [...dailyRows, ...itemRows]
    .filter((row) => !row.ok)
    .map((row) => ({
      row_number: row.row_number,
      row_kind: row.row_kind,
      reason_code: row.reason_code,
      reason_message: row.reason_message,
      raw_row_preview: sanitizeRevenueRow(row.raw_row),
    }));

  return {
    parser_type: parserType,
    source_type: sourceType,
    detected_columns: parsed.detected_columns,
    proposed_mapping: parsed.proposed_mapping,
    daily_rows: acceptedDailyRows,
    item_rows: acceptedItemRows,
    rejected_rows: rejectedRows,
    sample_normalized_rows: {
      daily_rows: acceptedDailyRows.slice(0, 3),
      item_rows: acceptedItemRows.slice(0, 3),
    },
    mapping_summary: {
      parser_type: parserType,
      detected_daily_fields: Object.keys(parsed.proposed_mapping.daily ?? {}),
      detected_item_fields: Object.keys(parsed.proposed_mapping.item ?? {}),
    },
    quality_summary: {
      accepted_count: acceptedDailyRows.length + acceptedItemRows.length,
      rejected_count: rejectedRows.length,
      row_count: acceptedDailyRows.length + acceptedItemRows.length + rejectedRows.length,
    },
  };
}

function parsePayloadByType(payload, parserType, sourceType = "") {
  const deliveryParser = isDeliverySourceType(parserType) || isDeliverySourceType(sourceType);
  if (Array.isArray(payload.daily_rows) || Array.isArray(payload.item_rows)) {
    return {
      daily_rows: Array.isArray(payload.daily_rows) ? payload.daily_rows : [],
      item_rows: Array.isArray(payload.item_rows) ? payload.item_rows : [],
      detected_columns: detectObjectColumns([...(payload.daily_rows ?? []), ...(payload.item_rows ?? [])]),
      proposed_mapping: {
        daily: buildMapping(detectObjectColumns(payload.daily_rows ?? []), DAILY_ALIASES),
        item: buildMapping(detectObjectColumns(payload.item_rows ?? []), ITEM_ALIASES),
      },
    };
  }

  const csvText = text(payload.csv_text);
  if (!csvText) {
    return {
      daily_rows: [],
      item_rows: [],
      detected_columns: [],
      proposed_mapping: { daily: {}, item: {} },
    };
  }

  const rows = parseCsv(csvText);
  const detectedColumns = rows.headers;
  const dailyMapping = buildMapping(detectedColumns, DAILY_ALIASES);
  const itemMapping = buildMapping(detectedColumns, ITEM_ALIASES);
  const mappedRows = rows.records.map((row, index) => mapCsvRow(row, parserType, dailyMapping, itemMapping, { sourceType, rowIndex: index }));
  const itemParser = parserType === "standard_item_revenue_csv"
    || parserType === "toss_style_product_orders_csv"
    || (Boolean(itemMapping.item_name) && !deliveryParser);

  return {
    daily_rows: itemParser ? [] : mappedRows,
    item_rows: itemParser ? mappedRows : [],
    detected_columns: detectedColumns,
    proposed_mapping: { daily: dailyMapping, item: itemMapping },
  };
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const headers = (rows.shift() ?? []).map((header) => header.trim());
  return {
    headers,
    records: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

function mapCsvRow(row, parserType, dailyMapping, itemMapping, { sourceType = "", rowIndex = 0 } = {}) {
  const mapping = parserType === "standard_item_revenue_csv" || parserType === "toss_style_product_orders_csv"
    ? itemMapping
    : dailyMapping;
  const mapped = Object.fromEntries(Object.entries(mapping).map(([field, column]) => [field, row[column]]));
  if (isDeliverySourceType(sourceType) || isDeliverySourceType(parserType)) {
    mapped.channel = text(mapped.channel) || DELIVERY_CHANNEL_BY_SOURCE_TYPE[sourceType] || "delivery_provider";
    mapped.source_file_type = text(mapped.source_file_type) || sourceType || parserType;
    mapped.source_row_number = mapped.source_row_number || rowIndex + 1;
  }
  return mapped;
}

function normalizePreviewRow(kind, row, index) {
  const normalized = kind === "daily" ? normalizeDailyRow(row) : normalizeItemRow(row);
  if (!normalized.ok) {
    return {
      ok: false,
      row_kind: kind,
      row_number: index + 1,
      raw_row: row,
      reason_code: normalized.reason_code,
      reason_message: normalized.reason_message,
    };
  }
  return {
    ok: true,
    row_kind: kind,
    row_number: index + 1,
    value: normalized.value,
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
  // When CSV provides only gross_sales_amount, fall back to gross (minus
  // discount/refund when present) so chart/KPI/AOV don't compute from zeros.
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

// Map every alias (English, legacy, Korean) onto a small canonical set. All
// downstream code (overwrite key, daily_series builder, KPI aggregation,
// export) compares against this canonical value, so an "offline" CSV upload
// and a "오프라인" Korean upload and a legacy "offline_pos" manual entry all
// land on the same internal channel.
const CHANNEL_ALIASES = {
  offline: ["offline", "offline_pos", "pos", "store", "in_store", "오프라인", "매장", "매장판매", "홀", "홀매출"],
  baemin: ["baemin", "delivery_baemin", "배민", "배달의민족"],
  coupangeats: ["coupangeats", "coupang_eats", "delivery_coupangeats", "쿠팡이츠", "쿠팡"],
  naver: ["naver", "네이버", "네이버주문", "네이버예약"],
  online: ["online", "온라인"],
};

const CHANNEL_ALIAS_LOOKUP = (() => {
  const map = new Map();
  for (const [canonical, aliases] of Object.entries(CHANNEL_ALIASES)) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(normalizeChannelKey(alias), canonical);
    }
  }
  return map;
})();

function normalizeChannelKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function canonicalChannel(value) {
  const trimmed = text(value);
  if (!trimmed) return "offline";
  const key = normalizeChannelKey(trimmed);
  if (CHANNEL_ALIAS_LOOKUP.has(key)) return CHANNEL_ALIAS_LOOKUP.get(key);
  // Preserve unknown channels (e.g. "delivery_provider") rather than forcing
  // them into "offline" — keeps non-target channels groupable but isolated.
  return key || "offline";
}

// Aliases (raw stored values) that canonicalize to the same channel. Stores
// pass these to their supersede WHERE so legacy rows (e.g. "offline_pos")
// are dropped when a new upload writes the canonical "offline" row.
function channelAliasesFor(canonical) {
  const aliases = new Set([canonical]);
  for (const [c, list] of Object.entries(CHANNEL_ALIASES)) {
    if (c === canonical) for (const alias of list) aliases.add(alias);
  }
  return Array.from(aliases);
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

function parseDate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(trimmed)) return trimmed.replace(/\./g, "-");
  if (/^\d{8}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  return null;
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

function buildMapping(columns, aliases) {
  const normalizedColumns = new Map(columns.map((column) => [normalizeColumn(column), column]));
  const mapping = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const column = candidates.map(normalizeColumn).find((candidate) => normalizedColumns.has(candidate));
    if (column) {
      mapping[field] = normalizedColumns.get(column);
    }
  }
  return mapping;
}

function detectObjectColumns(rows) {
  const columns = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) columns.add(key);
  }
  return Array.from(columns);
}

function inferParserType(payload) {
  const sourceType = text(payload.source_type);
  if (payload.csv_text && DELIVERY_SOURCE_TYPES.includes(sourceType)) return sourceType;
  if (payload.csv_text && sourceType === "toss_place_excel") return "toss_style_payments_csv";
  if (payload.csv_text && sourceType === "generic_pos_csv") return "standard_daily_revenue_csv";
  return payload.csv_text ? "standard_daily_revenue_csv" : "json_manual_template";
}

function isDeliverySourceType(sourceType) {
  return DELIVERY_SOURCE_TYPES.includes(text(sourceType));
}

function normalizeColumn(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

module.exports = {
  DELIVERY_SOURCE_TYPES,
  previewRevenueUploadPayload,
  parseCsv,
  canonicalChannel,
  channelAliasesFor,
};
