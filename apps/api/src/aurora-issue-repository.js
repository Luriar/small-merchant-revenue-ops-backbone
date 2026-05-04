class AuroraIssueRepository {
  constructor({ db }) {
    this.db = db;
  }

  async createOrReplay(input) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const existingByExternal = await findExistingIssueByExternalRef(
        queryable,
        input.source,
        input.external_id,
      );
      if (existingByExternal) {
        return buildReplayResponse(existingByExternal.issue_id);
      }

      const existingByIdempotency = await findExistingIssueByIdempotency(
        queryable,
        input.idempotency_key,
      );
      if (existingByIdempotency) {
        return buildReplayResponse(existingByIdempotency.issue_id);
      }

      let inserted;
      try {
        inserted = await insertIssue(queryable, input);
      } catch (error) {
        if (isIssueExternalRefConflict(error)) {
          const replayByExternal = await findExistingIssueByExternalRef(
            queryable,
            input.source,
            input.external_id,
          );
          if (replayByExternal) {
            return buildReplayResponse(replayByExternal.issue_id);
          }
        }

        throw error;
      }

      if (input.idempotency_key) {
        try {
          await recordIssueIdempotency(queryable, input.idempotency_key, inserted.issue_id);
        } catch (error) {
          if (isIssueIdempotencyConflict(error)) {
            const replayByIdempotency = await findExistingIssueByIdempotency(
              queryable,
              input.idempotency_key,
            );
            if (replayByIdempotency) {
              return buildReplayResponse(replayByIdempotency.issue_id);
            }
          }

          throw error;
        }
      }

      return {
        statusCode: 201,
        body: {
          issue_id: inserted.issue_id,
          idempotent_replay: false,
          created: true,
        },
      };
    });
  }

  async listIssues({ issueFamily, severity, status, source, limit, cursor }) {
    const clauses = [];
    const values = [];

    if (issueFamily) {
      values.push(issueFamily);
      clauses.push(`issue_family = $${values.length}`);
    }

    if (severity !== null) {
      values.push(severity);
      clauses.push(`severity = $${values.length}`);
    }

    if (status) {
      values.push(status);
      clauses.push(`status = $${values.length}`);
    }

    if (source) {
      values.push(source);
      clauses.push(`source = $${values.length}`);
    }

    if (cursor) {
      values.push(cursor.created_at);
      const createdAtIndex = values.length;
      values.push(cursor.issue_id);
      const issueIdIndex = values.length;
      clauses.push(`(created_at < $${createdAtIndex}::timestamptz OR (created_at = $${createdAtIndex}::timestamptz AND issue_id > $${issueIdIndex}))`);
    }

    let text = `
      SELECT
        issue_id,
        issue_family,
        severity,
        status,
        source,
        external_id,
        created_at
      FROM issue
    `;

    if (clauses.length > 0) {
      text += ` WHERE ${clauses.join(" AND ")}`;
    }

    text += " ORDER BY created_at DESC, issue_id ASC";

    if (Number.isInteger(limit)) {
      values.push(limit + 1);
      text += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(text, values);

    return {
      items: result.rows.map((row) => ({
        issue_id: row.issue_id,
        summary: deriveIssueSummary(row),
        issue_family: row.issue_family,
        severity: row.severity,
        status: row.status,
        source: row.source,
        external_id_present: typeof row.external_id === "string" && row.external_id.length > 0,
        created_at: row.created_at,
      })),
    };
  }

  async getIssueById(issueId) {
    const result = await this.db.query(
      `
        SELECT
          issue_id,
          issue_family,
          severity,
          status,
          source,
          external_id,
          created_at,
          reporter,
          affected_variation,
          keywords,
          body
        FROM issue
        WHERE issue_id = $1
        LIMIT 1
      `,
      [issueId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      issue_id: row.issue_id,
      summary: deriveIssueSummary(row),
      issue_family: row.issue_family,
      severity: row.severity,
      status: row.status,
      source: row.source,
      external_id_present: typeof row.external_id === "string" && row.external_id.length > 0,
      created_at: row.created_at,
      reporter_present: hasNonEmptyString(row.reporter),
      affected_variation_present: hasNonEmptyString(row.affected_variation),
      keywords_count: Array.isArray(row.keywords) ? row.keywords.length : 0,
      body_present: hasNonEmptyString(row.body),
    };
  }

  async updateIssueStatus({ issueId, status, expectedVersion }) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const current = await queryable.query(
        `
          SELECT issue_id, status, version
          FROM issue
          WHERE issue_id = $1
          LIMIT 1
        `,
        [issueId],
      );

      const currentRow = current.rows[0];
      if (!currentRow) {
        return { kind: "not_found" };
      }

      if (currentRow.version !== expectedVersion) {
        return { kind: "version_conflict" };
      }

      // Aurora baseline triggers handle:
      //   - trg_set_updated_at_and_version: bumps version + updated_at
      //   - trg_auto_set_resolved_at: sets resolved_at on first resolved transition
      // The optimistic lock is enforced by the WHERE version = $3 guard so a
      // concurrent writer that bumped version between our SELECT and UPDATE
      // surfaces as version_conflict instead of a silent overwrite.
      const updateResult = await queryable.query(
        `
          UPDATE issue
          SET status = $1
          WHERE issue_id = $2
            AND version = $3
          RETURNING status, version
        `,
        [status, issueId, expectedVersion],
      );

      if (!updateResult.rows[0]) {
        return { kind: "version_conflict" };
      }

      const updatedRow = updateResult.rows[0];
      return {
        kind: "ok",
        body: {
          issue_id: issueId,
          previous_status: currentRow.status,
          current_status: updatedRow.status,
          previous_version: currentRow.version,
          current_version: updatedRow.version,
        },
      };
    });
  }

  async listDashboardTimelineItems({ source, limit, cursor }) {
    const clauses = [];
    const values = [];

    if (source) {
      values.push(source);
      clauses.push(`source = $${values.length}`);
    }

    if (cursor) {
      values.push(cursor.occurred_at);
      const occurredAtIndex = values.length;
      values.push(cursor.item_type);
      const itemTypeIndex = values.length;
      values.push(cursor.item_id);
      const itemIdIndex = values.length;
      clauses.push(`(COALESCE(occurred_at, created_at) < $${occurredAtIndex}::timestamptz OR (COALESCE(occurred_at, created_at) = $${occurredAtIndex}::timestamptz AND ('issue' > $${itemTypeIndex} OR ('issue' = $${itemTypeIndex} AND issue_id > $${itemIdIndex}))))`);
    }

    let text = `
      SELECT
        issue_id,
        issue_family,
        status,
        source,
        occurred_at,
        created_at
      FROM issue
    `;

    if (clauses.length > 0) {
      text += ` WHERE ${clauses.join(" AND ")}`;
    }

    text += " ORDER BY COALESCE(occurred_at, created_at) DESC, issue_id ASC";

    if (Number.isInteger(limit)) {
      values.push(limit + 1);
      text += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(text, values);

    return {
      items: result.rows.map((row) => ({
        item_type: "issue",
        item_id: row.issue_id,
        summary: deriveIssueSummary(row),
        status: row.status,
        source: row.source,
        occurred_at: row.occurred_at ?? row.created_at,
      })),
    };
  }
}

async function findExistingIssueByExternalRef(queryable, source, externalId) {
  if (!source || !externalId) {
    return null;
  }

  const result = await queryable.query(
    `
      SELECT issue_id
      FROM issue
      WHERE source = $1
        AND external_id = $2
      LIMIT 1
    `,
    [source, externalId],
  );

  return result.rows[0] ?? null;
}

async function findExistingIssueByIdempotency(queryable, idempotencyKey) {
  if (!idempotencyKey) {
    return null;
  }

  const result = await queryable.query(
    `
      SELECT issue_id
      FROM issue_intake_idempotency
      WHERE request_type = 'issue'
        AND idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey],
  );

  return result.rows[0] ?? null;
}

async function insertIssue(queryable, input) {
  const result = await queryable.query(
    `
      INSERT INTO issue (
        external_id,
        source,
        title,
        body,
        issue_family,
        severity,
        keywords,
        affected_variation,
        payload,
        reporter,
        occurred_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11::timestamptz
      )
      RETURNING issue_id
    `,
    [
      input.external_id,
      input.source,
      input.title,
      input.body,
      input.issue_family,
      input.severity,
      input.keywords,
      input.affected_variation,
      input.payload ? JSON.stringify(input.payload) : null,
      input.reporter,
      input.occurred_at,
    ],
  );

  return result.rows[0];
}

async function recordIssueIdempotency(queryable, idempotencyKey, issueId) {
  // NOTE: the baseline Aurora `issue` table does not include idempotency_key.
  // The baseline Aurora DDL provides `issue_intake_idempotency` as the replay ledger.
  await queryable.query(
    `
      INSERT INTO issue_intake_idempotency (
        request_type,
        idempotency_key,
        issue_id
      )
      VALUES ('issue', $1, $2)
    `,
    [idempotencyKey, issueId],
  );
}

function buildReplayResponse(issueId) {
  return {
    statusCode: 200,
    body: {
      issue_id: issueId,
      idempotent_replay: true,
      created: false,
    },
  };
}

function isIssueExternalRefConflict(error) {
  return isUniqueViolation(error) && matchesConstraint(error, "uq_issue_external");
}

function isIssueIdempotencyConflict(error) {
  return isUniqueViolation(error) && matchesConstraint(error, "pk_issue_intake_idempotency");
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

function matchesConstraint(error, constraintName) {
  return typeof error?.constraint === "string" && error.constraint === constraintName;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function deriveIssueSummary(row) {
  return hasNonEmptyString(row.issue_family) ? row.issue_family : "Issue summary unavailable";
}

module.exports = {
  AuroraIssueRepository,
};
