const CHANGE_TYPE_TO_CODE = Object.freeze({
  release: "CHGT001",
  flag: "CHGT002",
  rule: "CHGT003",
});
const CHANGE_CODE_TO_TYPE = Object.freeze(
  Object.fromEntries(
    Object.entries(CHANGE_TYPE_TO_CODE).map(([type, code]) => [code, type]),
  ),
);

class AuroraChangeRepository {
  constructor({ db }) {
    this.db = db;
  }

  async createOrReplay(input) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const existing = await findExistingChangeId(queryable, input.idempotency_key);
      if (existing) {
        return buildReplayResponse(existing.change_id);
      }

      const inserted = await insertProdChange(queryable, input);
      try {
        await recordChangeIdempotency(queryable, input.idempotency_key, inserted.change_id);
      } catch (error) {
        if (isChangeIdempotencyConflict(error)) {
          const replay = await findExistingChangeId(queryable, input.idempotency_key);
          if (replay) {
            return buildReplayResponse(replay.change_id);
          }
        }

        throw error;
      }

      return {
        statusCode: 201,
        body: {
          change_id: inserted.change_id,
          idempotent_replay: false,
          created: true,
        },
      };
    });
  }

  async listChanges({ changeType, targetService, source, limit, cursor }) {
    const clauses = [];
    const values = [];

    if (changeType) {
      values.push(CHANGE_TYPE_TO_CODE[changeType]);
      clauses.push(`chgt_cd = $${values.length}`);
    }

    if (targetService) {
      values.push(targetService);
      clauses.push(`target_service = $${values.length}`);
    }

    if (source) {
      values.push(source);
      clauses.push(`source = $${values.length}`);
    }

    if (cursor) {
      values.push(cursor.occurred_at);
      const occurredAtIndex = values.length;
      values.push(cursor.change_id);
      const changeIdIndex = values.length;
      clauses.push(`(occurred_at < $${occurredAtIndex}::timestamptz OR (occurred_at = $${occurredAtIndex}::timestamptz AND change_id > $${changeIdIndex}))`);
    }

    let text = `
      SELECT
        change_id,
        chgt_cd,
        title,
        target_service,
        source,
        occurred_at,
        created_at
      FROM prod_change
    `;

    if (clauses.length > 0) {
      text += ` WHERE ${clauses.join(" AND ")}`;
    }

    text += " ORDER BY occurred_at DESC, change_id ASC";

    if (Number.isInteger(limit)) {
      values.push(limit + 1);
      text += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(text, values);

    return {
      items: result.rows.map((row) => ({
        change_id: row.change_id,
        change_type: CHANGE_CODE_TO_TYPE[row.chgt_cd?.trim()] ?? null,
        title: row.title,
        target_service: row.target_service,
        source: row.source,
        occurred_at: row.occurred_at,
        created_at: row.created_at,
      })),
    };
  }

  async getChangeById(changeId) {
    const result = await this.db.query(
      `
        SELECT
          change_id,
          chgt_cd,
          title,
          target_service,
          source,
          occurred_at,
          created_at,
          actor,
          rule_scope
        FROM prod_change
        WHERE change_id = $1
        LIMIT 1
      `,
      [changeId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      change_id: row.change_id,
      change_type: CHANGE_CODE_TO_TYPE[row.chgt_cd?.trim()] ?? null,
      title: row.title,
      target_service: row.target_service,
      source: row.source,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      actor_present: hasNonEmptyString(row.actor),
      rule_scope_present: isPlainObject(row.rule_scope),
    };
  }

  async listDashboardChangeMarkers({ targetService, from, to }) {
    const clauses = [];
    const values = [];

    if (targetService) {
      values.push(targetService);
      clauses.push(`target_service = $${values.length}`);
    }

    if (from) {
      values.push(from);
      clauses.push(`occurred_at >= $${values.length}::timestamptz`);
    }

    if (to) {
      values.push(to);
      clauses.push(`occurred_at <= $${values.length}::timestamptz`);
    }

    let text = `
      SELECT
        change_id,
        title,
        occurred_at
      FROM prod_change
    `;

    if (clauses.length > 0) {
      text += ` WHERE ${clauses.join(" AND ")}`;
    }

    text += " ORDER BY occurred_at DESC, change_id ASC";

    const result = await this.db.query(text, values);

    return {
      items: result.rows.map((row) => ({
        change_id: row.change_id,
        title: row.title,
        occurred_at: row.occurred_at,
      })),
    };
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
      clauses.push(`(occurred_at < $${occurredAtIndex}::timestamptz OR (occurred_at = $${occurredAtIndex}::timestamptz AND ('change' > $${itemTypeIndex} OR ('change' = $${itemTypeIndex} AND change_id > $${itemIdIndex}))))`);
    }

    let text = `
      SELECT
        change_id,
        title,
        source,
        occurred_at
      FROM prod_change
    `;

    if (clauses.length > 0) {
      text += ` WHERE ${clauses.join(" AND ")}`;
    }

    text += " ORDER BY occurred_at DESC, change_id ASC";

    if (Number.isInteger(limit)) {
      values.push(limit + 1);
      text += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(text, values);

    return {
      items: result.rows.map((row) => ({
        item_type: "change",
        item_id: row.change_id,
        title: row.title,
        status: null,
        source: row.source,
        occurred_at: row.occurred_at,
      })),
    };
  }
}

async function findExistingChangeId(queryable, idempotencyKey) {
  const result = await queryable.query(
    `
      SELECT change_id
      FROM change_intake_idempotency
      WHERE request_type = 'change'
        AND idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey],
  );

  return result.rows[0] ?? null;
}

async function insertProdChange(queryable, input) {
  const result = await queryable.query(
    `
      INSERT INTO prod_change (
        chgt_cd,
        title,
        target_service,
        target_component,
        variation,
        cohort,
        rule_scope,
        payload,
        actor,
        source,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::timestamptz)
      RETURNING change_id
    `,
    [
      CHANGE_TYPE_TO_CODE[input.change_type],
      input.title,
      input.target_service,
      input.target_component,
      input.variation,
      input.cohort,
      input.rule_scope ? JSON.stringify(input.rule_scope) : null,
      input.payload ? JSON.stringify(input.payload) : null,
      input.actor,
      input.source,
      input.occurred_at,
    ],
  );

  return result.rows[0];
}

async function recordChangeIdempotency(queryable, idempotencyKey, changeId) {
  // NOTE: the current baseline prod_change table does not contain idempotency_key.
  // The baseline Aurora DDL provides `change_intake_idempotency` as the replay ledger.
  await queryable.query(
    `
      INSERT INTO change_intake_idempotency (
        request_type,
        idempotency_key,
        change_id
      )
      VALUES ('change', $1, $2)
    `,
    [idempotencyKey, changeId],
  );
}

function buildReplayResponse(changeId) {
  return {
    statusCode: 200,
    body: {
      change_id: changeId,
      idempotent_replay: true,
      created: false,
    },
  };
}

function isChangeIdempotencyConflict(error) {
  return isUniqueViolation(error) && matchesConstraint(error, "pk_change_intake_idempotency");
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  AuroraChangeRepository,
  CHANGE_TYPE_TO_CODE,
  CHANGE_CODE_TO_TYPE,
};
