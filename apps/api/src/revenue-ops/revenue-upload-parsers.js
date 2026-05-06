const DAILY_ALIASES = {
  business_date: ["business_date", "date", "payment_date", "order_date", "영업일", "일자", "결제일", "주문일"],
  channel: ["channel", "sales_channel", "채널"],
  gross_sales_amount: ["gross_sales_amount", "gross_amount", "sales_amount", "총매출", "총 결제금액", "결제금액"],
  net_sales_amount: ["net_sales_amount", "net_amount", "settlement_amount", "순매출", "정산금액"],
  order_count: ["order_count", "orders", "transaction_count", "주문수", "거래수"],
  cancel_count: ["cancel_count", "cancellations", "취소수"],
  refund_amount: ["refund_amount", "refunds", "환불금액"],
  discount_amount: ["discount_amount", "discounts", "할인금액"],
  payment_card_amount: ["payment_card_amount", "card_amount", "카드금액"],
  payment_cash_amount: ["payment_cash_amount", "cash_amount", "현금금액"],
};

const ITEM_ALIASES = {
  business_date: ["business_date", "date", "order_date", "payment_date", "영업일", "일자", "주문일"],
  channel: ["channel", "sales_channel", "채널"],
  item_name: ["item_name", "product_name", "menu_name", "상품명", "메뉴명"],
  item_category: ["item_category", "category", "상품분류", "카테고리"],
  quantity: ["quantity", "qty", "수량"],
  gross_sales_amount: ["gross_sales_amount", "gross_amount", "sales_amount", "총매출", "결제금액"],
  discount_amount: ["discount_amount", "discounts", "할인금액"],
  net_sales_amount: ["net_sales_amount", "net_amount", "settlement_amount", "순매출", "정산금액"],
};

function previewRevenueUploadPayload(payload = {}) {
  const parserType = text(payload.parser_type) || inferParserType(payload);
  const sourceType = text(payload.source_type) || parserType || "manual_template";
  const parsed = parsePayloadByType(payload, parserType);
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

function parsePayloadByType(payload, parserType) {
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
  const mappedRows = rows.records.map((row) => mapCsvRow(row, parserType, dailyMapping, itemMapping));
  const itemParser = parserType === "standard_item_revenue_csv"
    || parserType === "toss_style_product_orders_csv"
    || Boolean(itemMapping.item_name);

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

function mapCsvRow(row, parserType, dailyMapping, itemMapping) {
  const mapping = parserType === "standard_item_revenue_csv" || parserType === "toss_style_product_orders_csv"
    ? itemMapping
    : dailyMapping;
  return Object.fromEntries(Object.entries(mapping).map(([field, column]) => [field, row[column]]));
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
  return accepted({
    business_date: businessDate,
    channel: text(row.channel) || "offline_pos",
    gross_sales_amount: money(row.gross_sales_amount),
    net_sales_amount: money(row.net_sales_amount),
    order_count: orderCount,
    cancel_count: int(row.cancel_count, 0),
    refund_amount: money(row.refund_amount),
    discount_amount: money(row.discount_amount),
    payment_card_amount: money(row.payment_card_amount),
    payment_cash_amount: money(row.payment_cash_amount),
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
    channel: text(row.channel) || "offline_pos",
    item_name: itemName,
    item_category: text(row.item_category) || null,
    quantity: int(row.quantity, 0),
    gross_sales_amount: money(row.gross_sales_amount),
    discount_amount: money(row.discount_amount),
    net_sales_amount: money(row.net_sales_amount),
  });
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
    "refund_amount",
    "discount_amount",
    "payment_card_amount",
    "payment_cash_amount",
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function money(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function int(value, fallback = 0) {
  const number = Number(value ?? fallback);
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
  if (payload.csv_text && payload.source_type === "toss_place_excel") return "toss_style_payments_csv";
  if (payload.csv_text && payload.source_type === "generic_pos_csv") return "standard_daily_revenue_csv";
  return payload.csv_text ? "standard_daily_revenue_csv" : "json_manual_template";
}

function normalizeColumn(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

module.exports = {
  previewRevenueUploadPayload,
  parseCsv,
};
