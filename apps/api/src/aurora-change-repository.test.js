const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AuroraChangeRepository,
  CHANGE_CODE_TO_TYPE,
  CHANGE_TYPE_TO_CODE,
} = require("./aurora-change-repository");

test("AuroraChangeRepository returns replay response for existing idempotency_key", async () => {
  const queries = [];
  const repository = new AuroraChangeRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM change_intake_idempotency")) {
          return { rows: [{ change_id: "change-existing-1" }] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput());

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.change_id, "change-existing-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(queries.length, 1);
});

test("AuroraChangeRepository inserts prod_change and records idempotency for a new request", async () => {
  const queries = [];
  const repository = new AuroraChangeRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM change_intake_idempotency")) {
          return { rows: [] };
        }

        if (text.includes("INSERT INTO prod_change")) {
          return { rows: [{ change_id: "change-new-1" }] };
        }

        if (text.includes("INSERT INTO change_intake_idempotency")) {
          return { rows: [] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput());

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.change_id, "change-new-1");
  assert.equal(result.body.created, true);
  assert.equal(queries.length, 3);
  assert.equal(queries[1].values[0], CHANGE_TYPE_TO_CODE.release);
  assert.equal(queries[2].values[0], "change-key-1");
  assert.equal(queries[2].values[1], "change-new-1");
});

test("AuroraChangeRepository converges idempotency ledger unique conflict to replay", async () => {
  const repository = new AuroraChangeRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("FROM change_intake_idempotency")) {
          if (!this.seenReplayLookup) {
            this.seenReplayLookup = true;
            return { rows: [] };
          }

          return { rows: [{ change_id: "change-race-1" }] };
        }

        if (text.includes("INSERT INTO prod_change")) {
          return { rows: [{ change_id: "change-race-1" }] };
        }

        if (text.includes("INSERT INTO change_intake_idempotency")) {
          const error = new Error("duplicate key");
          error.code = "23505";
          error.constraint = "pk_change_intake_idempotency";
          throw error;
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput());

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.change_id, "change-race-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(result.body.created, false);
});

test("AuroraChangeRepository lists changes with filters and limit", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [{
            change_id: "change-1",
            chgt_cd: CHANGE_TYPE_TO_CODE.release,
            title: "Release A",
            target_service: "payments",
            source: "deploy-system",
            occurred_at: "2026-04-22T10:00:00.000Z",
            created_at: "2026-04-22T10:01:00.000Z",
            payload: { hidden: true },
          }],
        };
      },
    },
  });

  const result = await repository.listChanges({
    changeType: "release",
    targetService: "payments",
    source: "deploy-system",
    limit: 10,
  });

  assert.match(seenText, /WHERE chgt_cd = \$1 AND target_service = \$2 AND source = \$3/);
  assert.match(seenText, /ORDER BY occurred_at DESC, change_id ASC/);
  assert.match(seenText, /LIMIT \$4/);
  assert.deepEqual(seenValues, [CHANGE_TYPE_TO_CODE.release, "payments", "deploy-system", 11]);
  assert.deepEqual(result, {
    items: [{
      change_id: "change-1",
      change_type: CHANGE_CODE_TO_TYPE[CHANGE_TYPE_TO_CODE.release],
      title: "Release A",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:01:00.000Z",
    }],
  });
});

test("AuroraChangeRepository gets one change by id with safe detail projection", async () => {
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        assert.match(text, /FROM prod_change/);
        assert.match(text, /WHERE change_id = \$1/);
        assert.deepEqual(values, ["change-1"]);
        return {
          rows: [{
            change_id: "change-1",
            chgt_cd: CHANGE_TYPE_TO_CODE.flag,
            title: "Flag rollout",
            target_service: "checkout",
            source: "flag-service",
            occurred_at: "2026-04-22T13:00:00.000Z",
            created_at: "2026-04-22T13:01:00.000Z",
            actor: "operator-1",
            rule_scope: { market: "kr" },
            payload: { secret: true },
            created_by: "system",
          }],
        };
      },
    },
  });

  const result = await repository.getChangeById("change-1");

  assert.deepEqual(result, {
    change_id: "change-1",
    change_type: CHANGE_CODE_TO_TYPE[CHANGE_TYPE_TO_CODE.flag],
    title: "Flag rollout",
    target_service: "checkout",
    source: "flag-service",
    occurred_at: "2026-04-22T13:00:00.000Z",
    created_at: "2026-04-22T13:01:00.000Z",
    actor_present: true,
    rule_scope_present: true,
  });
});

test("AuroraChangeRepository applies cursor predicate for next page", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return { rows: [] };
      },
    },
  });

  await repository.listChanges({
    changeType: null,
    targetService: null,
    source: null,
    limit: 2,
    cursor: {
      type: "change_list_v1",
      occurred_at: "2026-04-22T11:00:00.000Z",
      change_id: "change-2",
    },
  });

  assert.match(seenText, /occurred_at < \$1::timestamptz OR \(occurred_at = \$1::timestamptz AND change_id > \$2\)/);
  assert.deepEqual(seenValues, ["2026-04-22T11:00:00.000Z", "change-2", 3]);
});

test("AuroraChangeRepository returns null when change is missing", async () => {
  const repository = new AuroraChangeRepository({
    db: {
      async query() {
        return { rows: [] };
      },
    },
  });

  const result = await repository.getChangeById("missing-change");
  assert.equal(result, null);
});

test("AuroraChangeRepository lists dashboard change markers with only safe marker fields", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [{
            change_id: "change-1",
            title: "Release A",
            occurred_at: "2026-04-22T10:00:00.000Z",
            payload: { hidden: true },
            source: "deploy-system",
          }],
        };
      },
    },
  });

  const result = await repository.listDashboardChangeMarkers({
    targetService: "checkout",
    from: "2026-04-22T09:00:00.000Z",
    to: "2026-04-22T11:00:00.000Z",
  });

  assert.match(seenText, /SELECT\s+change_id,\s+title,\s+occurred_at\s+FROM prod_change/);
  assert.match(seenText, /WHERE target_service = \$1 AND occurred_at >= \$2::timestamptz AND occurred_at <= \$3::timestamptz/);
  assert.match(seenText, /ORDER BY occurred_at DESC, change_id ASC/);
  assert.doesNotMatch(seenText, /payload/);
  assert.doesNotMatch(seenText, /source/);
  assert.deepEqual(seenValues, [
    "checkout",
    "2026-04-22T09:00:00.000Z",
    "2026-04-22T11:00:00.000Z",
  ]);
  assert.deepEqual(result, {
    items: [{
      change_id: "change-1",
      title: "Release A",
      occurred_at: "2026-04-22T10:00:00.000Z",
    }],
  });
});

test("AuroraChangeRepository lists dashboard timeline items with source filter and limit", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [{
            change_id: "change-1",
            title: "Release A",
            source: "deploy-system",
            occurred_at: "2026-04-22T10:00:00.000Z",
            payload: { hidden: true },
          }],
        };
      },
    },
  });

  const result = await repository.listDashboardTimelineItems({
    source: "deploy-system",
    limit: 10,
  });

  assert.match(seenText, /FROM prod_change/);
  assert.match(seenText, /WHERE source = \$1/);
  assert.match(seenText, /ORDER BY occurred_at DESC, change_id ASC/);
  assert.match(seenText, /LIMIT \$2/);
  assert.deepEqual(seenValues, ["deploy-system", 11]);
  assert.deepEqual(result, {
    items: [{
      item_type: "change",
      item_id: "change-1",
      title: "Release A",
      status: null,
      source: "deploy-system",
      occurred_at: "2026-04-22T10:00:00.000Z",
    }],
  });
});

test("AuroraChangeRepository applies timeline cursor predicate for next page", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraChangeRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return { rows: [] };
      },
    },
  });

  await repository.listDashboardTimelineItems({
    source: null,
    limit: 2,
    cursor: {
      type: "dashboard_timeline_v1",
      occurred_at: "2026-04-22T11:00:00.000Z",
      item_type: "change",
      item_id: "change-2",
    },
  });

  assert.match(seenText, /occurred_at < \$1::timestamptz OR \(occurred_at = \$1::timestamptz AND \('change' > \$2 OR \('change' = \$2 AND change_id > \$3\)\)\)/);
  assert.deepEqual(seenValues, ["2026-04-22T11:00:00.000Z", "change", "change-2", 3]);
});

function createMockDb({ onQuery }) {
  return {
    async withTransaction(work) {
      return work({
        query(text, values) {
          return Promise.resolve().then(() => onQuery.call(this, text, values));
        },
      });
    },
  };
}

function validInput() {
  return {
    idempotency_key: "change-key-1",
    change_type: "release",
    title: "Release 2026.04.22",
    target_service: "payments",
    target_component: null,
    variation: null,
    cohort: null,
    rule_scope: null,
    payload: { deployment_id: "dep-1" },
    actor: null,
    source: "deploy-system",
    occurred_at: "2026-04-22T10:00:00.000Z",
  };
}
