class TossPlaceClient {
  constructor({
    credentials = {},
    apiBaseUrl = credentials.apiBaseUrl,
    accessKey = credentials.accessKey,
    secretKey = credentials.secretKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  isConfigured() {
    return Boolean(this.apiBaseUrl && this.accessKey && this.secretKey);
  }

  async smoke(path = "/api-public/openapi/v1/version") {
    if (!this.isConfigured()) {
      return this.skipped("smoke", "missing_credentials");
    }
    if (!path) {
      return this.skipped("smoke", "not_configured");
    }
    if (typeof this.fetchImpl !== "function") {
      return this.skipped("smoke", "fetch_unavailable");
    }

    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(buildConnectorUrl(this.apiBaseUrl, path), {
        fetchImpl: this.fetchImpl,
        headers: {
          "x-access-key": this.accessKey,
          "x-secret-key": this.secretKey,
          "Content-Type": "application/json",
        },
      }, this.timeoutMs);
      return {
        operation: "smoke",
        status: "completed",
        status_code: response.status,
        duration_ms: Math.max(0, Date.now() - startedAt),
      };
    } catch (error) {
      return {
        operation: "smoke",
        status: "failed",
        reason: sanitizeErrorReason(error),
        duration_ms: Math.max(0, Date.now() - startedAt),
      };
    }
  }

  async fetchMerchants(path = null) {
    return path ? this.smoke(path) : this.skipped("fetchMerchants", "not_configured");
  }

  async fetchOrders(path = null) {
    return path ? this.smoke(path) : this.skipped("fetchOrders", "not_configured");
  }

  async fetchPayments(path = null) {
    return path ? this.smoke(path) : this.skipped("fetchPayments", "not_configured");
  }

  skipped(operation, reason) {
    return {
      operation,
      status: "skipped",
      reason,
      secret_ref_configured: false,
    };
  }
}

function transformTossOrderToRevenueFacts(order = {}) {
  return {
    daily_row: {
      business_date: order.business_date ?? order.order_date ?? null,
      channel: "toss_place",
      gross_sales_amount: Number(order.gross_amount ?? order.amount ?? 0),
      net_sales_amount: Number(order.net_amount ?? order.settlement_amount ?? order.gross_amount ?? order.amount ?? 0),
      order_count: 1,
      cancel_count: order.status === "cancelled" ? 1 : 0,
      refund_amount: Number(order.refund_amount ?? 0),
      discount_amount: Number(order.discount_amount ?? 0),
      payment_card_amount: Number(order.card_amount ?? 0),
      payment_cash_amount: Number(order.cash_amount ?? 0),
    },
    item_rows: [],
  };
}

async function syncTossPlaceStore({ storeId, connectionId, client = new TossPlaceClient() } = {}) {
  const merchants = await client.fetchMerchants();
  return {
    store_id: storeId,
    connection_id: connectionId,
    status: "skipped",
    merchants,
    reason: "Connector skeleton only. Enable with official API credentials and Secrets Manager reference later.",
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    const error = new Error("fetch_unavailable");
    error.reason = "fetch_unavailable";
    throw error;
  }
  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error("request_timeout");
      error.name = "AbortError";
      error.reason = "request_timeout";
      reject(error);
    }, timeoutMs);
  });
  try {
    const { fetchImpl: _unused, ...fetchOptions } = options;
    const response = await Promise.race([
      fetchImpl(url, { ...fetchOptions, signal: controller.signal }),
      timeoutPromise,
    ]);
    if (!response?.ok) {
      const error = new Error(`http_${response?.status || "error"}`);
      error.reason = `http_${response?.status || "error"}`;
      error.status = response?.status;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildConnectorUrl(apiBaseUrl, path) {
  return `${String(apiBaseUrl || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

function sanitizeErrorReason(error) {
  if (error?.reason) return error.reason;
  if (error?.name === "AbortError") return "request_timeout";
  const status = error?.status ? `_${error.status}` : "";
  return `connector_error${status}`;
}

module.exports = {
  TossPlaceClient,
  transformTossOrderToRevenueFacts,
  syncTossPlaceStore,
};
