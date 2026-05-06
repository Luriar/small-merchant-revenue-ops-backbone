const DELIVERY_PROVIDER_KINDS = ["hyphen", "codef", "mock"];

class DeliveryProviderClient {
  constructor({ credentials = {}, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  isConfigured() {
    const kind = this.credentials.providerKind;
    if (!DELIVERY_PROVIDER_KINDS.includes(kind)) return false;
    if (kind === "mock") return true;
    return Boolean(this.credentials.apiBaseUrl && this.credentials.clientId && (this.credentials.clientSecret || this.credentials.token));
  }

  async smoke() {
    if (!this.isConfigured()) {
      return {
        status: "skipped",
        reason: "missing_credentials",
        provider_kind: this.credentials.providerKind || null,
      };
    }
    if (this.credentials.providerKind === "mock") {
      return {
        status: "completed",
        provider_kind: "mock",
        normalized_rows: normalizeDeliveryProviderRows(mockDeliveryProviderRows()),
      };
    }
    return {
      status: "skipped",
      reason: "not_configured",
      provider_kind: this.credentials.providerKind,
    };
  }
}

function normalizeDeliveryProviderRows(rows = []) {
  return rows.map((row, index) => ({
    business_date: row.business_date,
    channel: row.channel || "delivery_baemin",
    gross_sales_amount: number(row.gross_sales_amount),
    net_sales_amount: number(row.net_sales_amount ?? row.settlement_amount ?? row.gross_sales_amount),
    order_count: integer(row.order_count, 0),
    cancellation_count: integer(row.cancellation_count ?? row.cancel_count, 0),
    delivery_fee_amount: number(row.delivery_fee_amount),
    commission_amount: number(row.commission_amount),
    settlement_amount: number(row.settlement_amount ?? row.net_sales_amount),
    source_file_type: row.source_file_type || "provider",
    source_row_number: integer(row.source_row_number, index + 1),
  }));
}

function mockDeliveryProviderRows() {
  return [{
    business_date: "2026-05-01",
    channel: "delivery_baemin",
    gross_sales_amount: 128000,
    net_sales_amount: 104000,
    order_count: 12,
    cancellation_count: 1,
    delivery_fee_amount: 18000,
    commission_amount: 6000,
    settlement_amount: 104000,
    source_file_type: "mock_provider",
    source_row_number: 1,
  }];
}

function number(value) {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function integer(value, fallback = 0) {
  const parsed = Number(String(value ?? fallback).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

module.exports = {
  DELIVERY_PROVIDER_KINDS,
  DeliveryProviderClient,
  normalizeDeliveryProviderRows,
  mockDeliveryProviderRows,
};
