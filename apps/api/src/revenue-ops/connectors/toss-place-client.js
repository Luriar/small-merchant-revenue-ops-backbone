class TossPlaceClient {
  constructor({ apiBaseUrl = "https://api.tosspayments.com", secretRef = null, fetchImpl = null } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.secretRef = secretRef;
    this.fetchImpl = fetchImpl;
  }

  async fetchMerchants() {
    return this.skipped("fetchMerchants");
  }

  async fetchOrders() {
    return this.skipped("fetchOrders");
  }

  async fetchPayments() {
    return this.skipped("fetchPayments");
  }

  skipped(operation) {
    return {
      operation,
      status: "skipped",
      reason: "Toss Place connector v0 is a Secrets Manager-backed skeleton; no API key is loaded in source code.",
      secret_ref_configured: Boolean(this.secretRef),
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

module.exports = {
  TossPlaceClient,
  transformTossOrderToRevenueFacts,
  syncTossPlaceStore,
};
