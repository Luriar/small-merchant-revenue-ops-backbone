class AuroraEventRepository {
  constructor({ db }) {
    this.db = db;
  }

  async acceptOrReplay(input) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const existing = await findExistingEvent(queryable, input.event_id);
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

      const inserted = await insertEventIntake(queryable, input);
      return {
        statusCode: 202,
        body: {
          event_id: inserted.event_id,
          accepted: true,
          idempotent_replay: false,
        },
      };
    });
  }
}

async function findExistingEvent(queryable, eventId) {
  const result = await queryable.query(
    `
      SELECT event_id
      FROM event_intake
      WHERE event_id = $1
      LIMIT 1
    `,
    [eventId],
  );

  return result.rows[0] ?? null;
}

async function insertEventIntake(queryable, input) {
  // NOTE: this repository depends on the baseline Aurora `event_intake` table.
  const result = await queryable.query(
    `
      INSERT INTO event_intake (
        event_id,
        occurred_at,
        target_service,
        event_type,
        event_subtype,
        variation,
        cohort,
        duration_ms,
        retry_count,
        is_error,
        user_id,
        session_id,
        request_id,
        payload,
        source,
        ingestion_batch_id
      )
      VALUES (
        $1,
        $2::timestamptz,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14::jsonb,
        $15,
        $16
      )
      RETURNING event_id
    `,
    [
      input.event_id,
      input.occurred_at,
      input.target_service,
      input.event_type,
      input.event_subtype,
      input.variation,
      input.cohort,
      input.duration_ms,
      input.retry_count,
      input.is_error,
      input.user_id,
      input.session_id,
      input.request_id,
      input.payload ? JSON.stringify(input.payload) : null,
      input.source,
      input.ingestion_batch_id,
    ],
  );

  return result.rows[0];
}

module.exports = {
  AuroraEventRepository,
};
