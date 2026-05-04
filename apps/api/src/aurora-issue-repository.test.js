const test = require("node:test");
const assert = require("node:assert/strict");

const { AuroraIssueRepository } = require("./aurora-issue-repository");

test("AuroraIssueRepository replays by source + external_id first", async () => {
  const queries = [];
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM issue") && text.includes("external_id")) {
          return { rows: [{ issue_id: "issue-existing-external-1" }] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput());

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue_id, "issue-existing-external-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(queries.length, 1);
});

test("AuroraIssueRepository replays by idempotency_key fallback", async () => {
  const queries = [];
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM issue") && text.includes("external_id")) {
          return { rows: [] };
        }

        if (text.includes("FROM issue_intake_idempotency")) {
          return { rows: [{ issue_id: "issue-existing-idem-1" }] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput({ external_id: null }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue_id, "issue-existing-idem-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(queries.length, 1);
});

test("AuroraIssueRepository inserts issue and records idempotency for a new request", async () => {
  const queries = [];
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("FROM issue") && text.includes("external_id")) {
          return { rows: [] };
        }

        if (text.includes("FROM issue_intake_idempotency")) {
          return { rows: [] };
        }

        if (text.includes("INSERT INTO issue (")) {
          return { rows: [{ issue_id: "issue-new-1" }] };
        }

        if (text.includes("INSERT INTO issue_intake_idempotency")) {
          return { rows: [] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput({ external_id: null }));

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.issue_id, "issue-new-1");
  assert.equal(result.body.created, true);
  assert.equal(queries.length, 3);
  assert.equal(queries[2].values[0], "issue-key-1");
  assert.equal(queries[2].values[1], "issue-new-1");
});

test("AuroraIssueRepository converges external ref unique conflict to replay", async () => {
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("FROM issue") && text.includes("external_id")) {
          if (!this.seenExternalReplayLookup) {
            this.seenExternalReplayLookup = true;
            return { rows: [] };
          }

          return { rows: [{ issue_id: "issue-race-external-1" }] };
        }

        if (text.includes("FROM issue_intake_idempotency")) {
          return { rows: [] };
        }

        if (text.includes("INSERT INTO issue (")) {
          const error = new Error("duplicate key");
          error.code = "23505";
          error.constraint = "uq_issue_external";
          throw error;
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput());

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue_id, "issue-race-external-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(result.body.created, false);
});

test("AuroraIssueRepository converges idempotency ledger unique conflict to replay", async () => {
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("FROM issue") && text.includes("external_id")) {
          return { rows: [] };
        }

        if (text.includes("FROM issue_intake_idempotency")) {
          if (!this.seenIdempotencyReplayLookup) {
            this.seenIdempotencyReplayLookup = true;
            return { rows: [] };
          }

          return { rows: [{ issue_id: "issue-race-idem-1" }] };
        }

        if (text.includes("INSERT INTO issue (")) {
          return { rows: [{ issue_id: "issue-race-idem-1" }] };
        }

        if (text.includes("INSERT INTO issue_intake_idempotency")) {
          const error = new Error("duplicate key");
          error.code = "23505";
          error.constraint = "pk_issue_intake_idempotency";
          throw error;
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.createOrReplay(validInput({ external_id: null }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue_id, "issue-race-idem-1");
  assert.equal(result.body.idempotent_replay, true);
  assert.equal(result.body.created, false);
});

test("AuroraIssueRepository lists issues with filters and limit", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraIssueRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [{
            issue_id: "issue-1",
            title: "Checkout error reported",
            issue_family: "payment_failed_issue",
            severity: 2,
            status: "open",
            source: "zendesk",
            external_id: "zendesk-1",
            created_at: "2026-04-22T10:01:00.000Z",
            body: "hidden",
            payload: { secret: true },
          }],
        };
      },
    },
  });

  const result = await repository.listIssues({
    issueFamily: "payment_failed_issue",
    severity: 2,
    status: "open",
    source: "zendesk",
    limit: 10,
  });

  assert.match(seenText, /WHERE issue_family = \$1 AND severity = \$2 AND status = \$3 AND source = \$4/);
  assert.match(seenText, /ORDER BY created_at DESC, issue_id ASC/);
  assert.match(seenText, /LIMIT \$5/);
  assert.doesNotMatch(seenText, /\btitle\b/);
  assert.deepEqual(seenValues, ["payment_failed_issue", 2, "open", "zendesk", 11]);
  assert.deepEqual(result, {
    items: [{
      issue_id: "issue-1",
      summary: "payment_failed_issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      status: "open",
      source: "zendesk",
      external_id_present: true,
      created_at: "2026-04-22T10:01:00.000Z",
    }],
  });
});

test("AuroraIssueRepository gets one issue by id with safe detail projection", async () => {
  const repository = new AuroraIssueRepository({
    db: {
      async query(text, values) {
        assert.match(text, /FROM issue/);
        assert.match(text, /WHERE issue_id = \$1/);
        assert.doesNotMatch(text, /\btitle\b/);
        assert.deepEqual(values, ["issue-1"]);
        return {
          rows: [{
            issue_id: "issue-1",
            title: "Checkout error reported",
            issue_family: "payment_failed_issue",
            severity: 2,
            status: "open",
            source: "zendesk",
            external_id: "zendesk-1",
            created_at: "2026-04-22T10:01:00.000Z",
            reporter: "reporter@example.invalid",
            affected_variation: "web",
            keywords: ["checkout", "payment"],
            body: "Sensitive body text",
            payload: { secret: true },
          }],
        };
      },
    },
  });

  const result = await repository.getIssueById("issue-1");

  assert.deepEqual(result, {
    issue_id: "issue-1",
    summary: "payment_failed_issue",
    issue_family: "payment_failed_issue",
    severity: 2,
    status: "open",
    source: "zendesk",
    external_id_present: true,
    created_at: "2026-04-22T10:01:00.000Z",
    reporter_present: true,
    affected_variation_present: true,
    keywords_count: 2,
    body_present: true,
  });
});

test("AuroraIssueRepository applies cursor predicate for next page", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraIssueRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return { rows: [] };
      },
    },
  });

  await repository.listIssues({
    issueFamily: null,
    severity: null,
    status: null,
    source: null,
    limit: 2,
    cursor: {
      type: "issue_list_v1",
      created_at: "2026-04-22T11:01:00.000Z",
      issue_id: "issue-2",
    },
  });

  assert.match(seenText, /created_at < \$1::timestamptz OR \(created_at = \$1::timestamptz AND issue_id > \$2\)/);
  assert.deepEqual(seenValues, ["2026-04-22T11:01:00.000Z", "issue-2", 3]);
});

test("AuroraIssueRepository returns null when issue is missing", async () => {
  const repository = new AuroraIssueRepository({
    db: {
      async query() {
        return { rows: [] };
      },
    },
  });

  const result = await repository.getIssueById("missing-issue");
  assert.equal(result, null);
});

test("AuroraIssueRepository lists dashboard timeline items with source filter and limit", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraIssueRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [{
            issue_id: "issue-1",
            title: "Checkout error reported",
            issue_family: "payment_failed_issue",
            status: "open",
            source: "zendesk",
            occurred_at: "2026-04-22T11:00:00.000Z",
            created_at: "2026-04-22T11:01:00.000Z",
            body: "hidden",
            payload: { secret: true },
          }],
        };
      },
    },
  });

  const result = await repository.listDashboardTimelineItems({
    source: "zendesk",
    limit: 5,
  });

  assert.match(seenText, /FROM issue/);
  assert.match(seenText, /WHERE source = \$1/);
  assert.match(seenText, /ORDER BY COALESCE\(occurred_at, created_at\) DESC, issue_id ASC/);
  assert.match(seenText, /LIMIT \$2/);
  assert.doesNotMatch(seenText, /\btitle\b/);
  assert.deepEqual(seenValues, ["zendesk", 6]);
  assert.deepEqual(result, {
    items: [{
      item_type: "issue",
      item_id: "issue-1",
      summary: "payment_failed_issue",
      status: "open",
      source: "zendesk",
      occurred_at: "2026-04-22T11:00:00.000Z",
    }],
  });
});

test("AuroraIssueRepository applies timeline cursor predicate for next page", async () => {
  let seenText = null;
  let seenValues = null;
  const repository = new AuroraIssueRepository({
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

  assert.match(seenText, /COALESCE\(occurred_at, created_at\) < \$1::timestamptz OR \(COALESCE\(occurred_at, created_at\) = \$1::timestamptz AND \('issue' > \$2 OR \('issue' = \$2 AND issue_id > \$3\)\)\)/);
  assert.deepEqual(seenValues, ["2026-04-22T11:00:00.000Z", "change", "change-2", 3]);
});

test("AuroraIssueRepository updateIssueStatus returns ok with previous and current state on match", async () => {
  const queries = [];
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text, values) {
        queries.push({ text, values });

        if (text.includes("SELECT issue_id, status, version")) {
          return { rows: [{ issue_id: "issue-status-1", status: "open", version: 1 }] };
        }

        if (text.includes("UPDATE issue") && text.includes("AND version = $3")) {
          return { rows: [{ status: values[0], version: 2 }], rowCount: 1 };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.updateIssueStatus({
    issueId: "issue-status-1",
    status: "investigating",
    expectedVersion: 1,
  });

  assert.equal(result.kind, "ok");
  assert.deepEqual(result.body, {
    issue_id: "issue-status-1",
    previous_status: "open",
    current_status: "investigating",
    previous_version: 1,
    current_version: 2,
  });
  assert.equal(queries.length, 2);
  assert.match(queries[0].text, /FROM issue/);
  assert.deepEqual(queries[0].values, ["issue-status-1"]);
  assert.match(queries[1].text, /UPDATE issue/);
  assert.match(queries[1].text, /WHERE issue_id = \$2\s+AND version = \$3/);
  assert.deepEqual(queries[1].values, ["investigating", "issue-status-1", 1]);
});

test("AuroraIssueRepository updateIssueStatus returns not_found when issue is missing", async () => {
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("SELECT issue_id, status, version")) {
          return { rows: [] };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.updateIssueStatus({
    issueId: "missing-issue",
    status: "investigating",
    expectedVersion: 1,
  });

  assert.equal(result.kind, "not_found");
});

test("AuroraIssueRepository updateIssueStatus returns version_conflict on stale expected_version", async () => {
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("SELECT issue_id, status, version")) {
          return { rows: [{ issue_id: "issue-stale-1", status: "open", version: 5 }] };
        }

        throw new Error("update should not be issued when version mismatches");
      },
    }),
  });

  const result = await repository.updateIssueStatus({
    issueId: "issue-stale-1",
    status: "investigating",
    expectedVersion: 1,
  });

  assert.equal(result.kind, "version_conflict");
});

test("AuroraIssueRepository updateIssueStatus returns version_conflict when UPDATE races and returns no rows", async () => {
  const repository = new AuroraIssueRepository({
    db: createMockDb({
      onQuery(text) {
        if (text.includes("SELECT issue_id, status, version")) {
          return { rows: [{ issue_id: "issue-race-1", status: "open", version: 1 }] };
        }

        if (text.includes("UPDATE issue")) {
          return { rows: [], rowCount: 0 };
        }

        throw new Error("unexpected query");
      },
    }),
  });

  const result = await repository.updateIssueStatus({
    issueId: "issue-race-1",
    status: "investigating",
    expectedVersion: 1,
  });

  assert.equal(result.kind, "version_conflict");
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

function validInput(overrides = {}) {
  return {
    idempotency_key: "issue-key-1",
    external_id: "zendesk-1",
    source: "zendesk",
    title: "Checkout error reported",
    body: "Customer reports checkout failure on web flow",
    issue_family: "payment_failed_issue",
    severity: 2,
    keywords: ["checkout", "payment"],
    affected_variation: "web",
    payload: { channel: "support" },
    reporter: "reporter@example.invalid",
    occurred_at: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}
