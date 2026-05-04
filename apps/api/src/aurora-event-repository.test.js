const test = require("node:test");
const assert = require("node:assert/strict");

const { AuroraEventRepository } = require("./aurora-event-repository");

test("AuroraEventRepository returns replay response for existing event_id", async () => {
  const queries = [];
  const repository = new AuroraEventRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM event_intake")) {
          return { rows: [{ event_id: "evt-existing-1" }] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.acceptOrReplay(validInput());

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.event_id, "evt-existing-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(queries.length, 1);
});

test("AuroraEventRepository inserts a new event for a new event_id", async () => {
  const queries = [];
  const repository = new AuroraEventRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM event_intake")) {
          return { rows: [] };
        }

        if (text.includes("INSERT INTO event_intake")) {
          return { rows: [{ event_id: "evt-new-1" }] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.acceptOrReplay(validInput());

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.event_id, "evt-new-1");
  assert.equal(result.body.accepted, true);
  assert.equal(result.body.idempotent_replay, false);
  assert.equal(queries.length, 2);
  assert.equal(queries[1].values[0], "evt-1");
});

function createMockDb({ onQuery }) {
  return {
    async withTransaction(work) {
      return work({
        query(text, values) {
          return Promise.resolve(onQuery(text, values));
        },
      });
    },
  };
}

function validInput() {
  return {
    event_id: "evt-1",
    occurred_at: "2026-04-22T10:00:00.000Z",
    target_service: "payments",
    event_type: "product",
    event_subtype: "checkout_failed",
    variation: null,
    cohort: null,
    duration_ms: 1200,
    retry_count: 1,
    is_error: true,
    user_id: "usr_9f3ab2",
    session_id: "sess_3a91f0",
    request_id: "req_7b61dd",
    payload: { metric: "checkout.error_rate" },
    source: "app-metrics",
    ingestion_batch_id: null,
  };
}
