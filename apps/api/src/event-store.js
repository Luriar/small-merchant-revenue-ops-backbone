class InMemoryEventStore {
  constructor() {
    this.byEventId = new Map();
  }

  acceptOrReplay(input) {
    const existing = this.byEventId.get(input.event_id);
    if (existing) {
      return {
        statusCode: 200,
        body: {
          event_id: existing.event_id,
          accepted: true,
          idempotent_replay: true,
        },
      };
    }

    const record = {
      event_id: input.event_id,
      occurred_at: input.occurred_at,
      target_service: input.target_service,
      event_type: input.event_type,
      event_subtype: input.event_subtype,
      variation: input.variation ?? null,
      cohort: input.cohort ?? null,
      duration_ms: input.duration_ms ?? null,
      retry_count: input.retry_count ?? 0,
      is_error: input.is_error ?? false,
      user_id: input.user_id ?? null,
      session_id: input.session_id ?? null,
      request_id: input.request_id ?? null,
      payload: input.payload ?? null,
      source: input.source,
      ingestion_batch_id: input.ingestion_batch_id ?? null,
      accepted_at: new Date().toISOString(),
    };

    this.byEventId.set(record.event_id, record);

    return {
      statusCode: 202,
      body: {
        event_id: record.event_id,
        accepted: true,
        idempotent_replay: false,
      },
    };
  }
}

module.exports = {
  InMemoryEventStore,
};
