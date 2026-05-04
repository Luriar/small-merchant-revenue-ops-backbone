const { createHash } = require("node:crypto");

const { TRACE_STATUS } = require("../../../packages/contracts/trace-create");

const ANOMALY_TYPE_TO_DB = Object.freeze({
  volume: "volume",
  error: "error",
  error_spike: "error",
  retry: "retry",
  cohort: "cohort",
});

const EVIDENCE_TYPE_TO_CODE = Object.freeze({
  timing: "EVDT001",
  variation: "EVDT002",
  event_spike: "EVDT003",
  rule_match: "EVDT004",
});

const EVIDENCE_STRENGTH_TO_CODE = Object.freeze({
  strong: "EVDS001",
  medium: "EVDS002",
  weak: "EVDS003",
});

const EVIDENCE_CODE_TO_TYPE = Object.freeze(
  Object.fromEntries(Object.entries(EVIDENCE_TYPE_TO_CODE).map(([key, value]) => [value, key])),
);

const EVIDENCE_CODE_TO_STRENGTH = Object.freeze(
  Object.fromEntries(Object.entries(EVIDENCE_STRENGTH_TO_CODE).map(([key, value]) => [value, key])),
);

class AuroraTraceRepository {
  constructor({ db }) {
    this.db = db;
  }

  async listTraces({ status, changeId, primaryIssueId, limit, cursor }) {
    const clauses = [];
    const values = [];

    if (status) {
      values.push(status);
      clauses.push(`status = $${values.length}`);
    }

    if (changeId) {
      values.push(changeId);
      clauses.push(`change_id = $${values.length}`);
    }

    if (primaryIssueId) {
      values.push(primaryIssueId);
      clauses.push(`primary_issue_id = $${values.length}`);
    }

    if (cursor) {
      values.push(cursor.created_at);
      const createdAtIndex = values.length;
      values.push(cursor.trace_id);
      const traceIdIndex = values.length;
      clauses.push(`(created_at < $${createdAtIndex}::timestamptz OR (created_at = $${createdAtIndex}::timestamptz AND trace_id > $${traceIdIndex}))`);
    }

    let query = `
      SELECT
        trace_id,
        change_id,
        primary_issue_id,
        status,
        confidence,
        anomaly_type,
        anomaly_metric,
        anomaly_window_start,
        anomaly_window_end,
        created_at
      FROM trace
    `;

    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }

    query += " ORDER BY created_at DESC, trace_id ASC";

    if (limit !== null && limit !== undefined) {
      values.push(limit + 1);
      query += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(query, values);
    return { items: result.rows };
  }

  async getTraceById(traceId) {
    const result = await this.db.query(
      `
        SELECT
          trace_id,
          change_id,
          primary_issue_id,
          status,
          confidence,
          anomaly_type,
          anomaly_metric,
          anomaly_window_start,
          anomaly_window_end,
          created_at,
          evidence_count
        FROM trace
        WHERE trace_id = $1
        LIMIT 1
      `,
      [traceId],
    );

    return result.rows[0] ?? null;
  }

  async listTraceEvidences(traceId) {
    const result = await this.db.query(
      `
        SELECT
          evidence_id,
          trace_id,
          evdt_cd,
          evds_cd,
          summary,
          source_ref->>'source_ref' AS source_ref,
          created_at
        FROM evidence
        WHERE trace_id = $1
        ORDER BY created_at ASC, evidence_id ASC
      `,
      [traceId],
    );

    return {
      items: result.rows.map(projectEvidenceRow),
    };
  }

  async getOverviewSummary() {
    const result = await this.db.query(
      `
        SELECT
          (COUNT(DISTINCT change_id) FILTER (WHERE change_id IS NOT NULL))::integer AS changes,
          COUNT(DISTINCT (anomaly_type, anomaly_metric, anomaly_window_start, anomaly_window_end))::integer AS detected_anomaly_patterns,
          (COUNT(DISTINCT primary_issue_id) FILTER (WHERE primary_issue_id IS NOT NULL))::integer AS linked_issues,
          COUNT(*) FILTER (WHERE status = 'suspected')::integer AS suspected_traces,
          COUNT(*) FILTER (WHERE status = 'confirmed')::integer AS confirmed_traces,
          COUNT(*) FILTER (WHERE status = 'dismissed')::integer AS dismissed_traces,
          MIN(anomaly_window_start) AS scope_from,
          MAX(anomaly_window_end) AS scope_to,
          CASE
            WHEN COUNT(DISTINCT anomaly_metric) FILTER (WHERE anomaly_metric IS NOT NULL) = 1
              THEN MIN(anomaly_metric)
            ELSE NULL
          END AS primary_metric
        FROM trace
      `,
      [],
    );

    return result.rows[0];
  }

  // NOTE: Internal worker path for atomic trace + evidence creation. The
  // future worker should provide richer anomaly_detail, event_refs, and
  // generated_by_run_id before this endpoint is promoted.
  async createOrReuseTraceWithEvidence(input) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const existingTrace = await findDuplicateTrace(queryable, input);

      let traceId;
      let traceCreated;

      if (existingTrace) {
        traceId = existingTrace.trace_id;
        traceCreated = false;
      } else {
        const insertedTrace = await insertTrace(queryable, input);
        traceId = insertedTrace.trace_id;
        traceCreated = true;
      }

      let evidenceCreatedCount = 0;
      let evidenceSkippedCount = 0;

      for (const evidence of input.evidences) {
        const fingerprint = buildEvidenceFingerprint(traceId, evidence);
        const duplicateEvidence = await findDuplicateEvidence(queryable, traceId, fingerprint);
        if (duplicateEvidence) {
          evidenceSkippedCount += 1;
          continue;
        }

        await insertEvidence(queryable, traceId, evidence);
        evidenceCreatedCount += 1;
      }

      const evidenceCount = await countEvidence(queryable, traceId);

      return {
        trace_id: traceId,
        trace_created: traceCreated,
        trace_reused: !traceCreated,
        evidence_count: evidenceCount,
        evidence_created_count: evidenceCreatedCount,
        evidence_skipped_count: evidenceSkippedCount,
      };
    });
  }
}

async function findDuplicateTrace(queryable, input) {
  const result = await queryable.query(
    `
      SELECT trace_id
      FROM trace
      WHERE status = 'suspected'
        AND change_id = $1
        AND primary_issue_id = $2
        AND anomaly_type = $3
        AND anomaly_metric = $4
        AND anomaly_window_start = $5::timestamptz
        AND anomaly_window_end = $6::timestamptz
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [
      input.change_id,
      input.primary_issue_id,
      mapAnomalyType(input.anomaly_type),
      input.anomaly_metric,
      input.anomaly_window_start,
      input.anomaly_window_end,
    ],
  );

  return result.rows[0] ?? null;
}

async function insertTrace(queryable, input) {
  // NOTE: current API payload does not expose confidence/anomaly_detail fields.
  // This repository fills the minimal Aurora-required values until a richer
  // trace-generation model is introduced.
  const result = await queryable.query(
    `
      INSERT INTO trace (
        change_id,
        primary_issue_id,
        status,
        confidence,
        anomaly_window_start,
        anomaly_window_end,
        anomaly_type,
        anomaly_metric,
        anomaly_detail
      )
      VALUES (
        $1,
        $2,
        'suspected',
        $3,
        $4::timestamptz,
        $5::timestamptz,
        $6,
        $7,
        $8::jsonb
      )
      RETURNING trace_id
    `,
    [
      input.change_id,
      input.primary_issue_id,
      deriveTraceConfidence(input.evidences),
      input.anomaly_window_start,
      input.anomaly_window_end,
      mapAnomalyType(input.anomaly_type),
      input.anomaly_metric,
      JSON.stringify({
        source: "api_trace_create_minimal",
        requested_anomaly_type: input.anomaly_type,
      }),
    ],
  );

  return result.rows[0];
}

async function findDuplicateEvidence(queryable, traceId, fingerprint) {
  const result = await queryable.query(
    `
      SELECT evidence_id
      FROM evidence
      WHERE trace_id = $1
        AND payload->>'fingerprint' = $2
      LIMIT 1
    `,
    [traceId, fingerprint],
  );

  return result.rows[0] ?? null;
}

async function insertEvidence(queryable, traceId, evidence) {
  const fingerprint = buildEvidenceFingerprint(traceId, evidence);
  const evdtCode = mapEvidenceType(evidence.evidence_type);
  const evdsCode = mapEvidenceStrength(evidence.strength);

  // NOTE: current API surface does not expose separate event_refs/source_ref JSON.
  // This repository stores the evidence fingerprint and source_ref in payload/source_ref
  // with the minimum shape needed for duplicate skipping.
  await queryable.query(
    `
      INSERT INTO evidence (
        trace_id,
        evdt_cd,
        evds_cd,
        summary,
        payload,
        source_ref,
        event_refs
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::jsonb,
        $7::text[]
      )
    `,
    [
      traceId,
      evdtCode,
      evdsCode,
      evidence.summary,
      JSON.stringify({
        ...(evidence.payload ?? {}),
        fingerprint,
      }),
      JSON.stringify({
        source_ref: evidence.source_ref,
      }),
      null,
    ],
  );
}

async function countEvidence(queryable, traceId) {
  const result = await queryable.query(
    `
      SELECT COUNT(*)::integer AS evidence_count
      FROM evidence
      WHERE trace_id = $1
    `,
    [traceId],
  );

  return result.rows[0]?.evidence_count ?? 0;
}

function buildEvidenceFingerprint(traceId, evidence) {
  const normalizedSourceRef = normalizeForFingerprint(evidence.source_ref);
  const normalizedSummary = normalizeForFingerprint(evidence.summary);

  return createHash("sha256")
    .update(`${traceId}::${evidence.evidence_type}::${normalizedSourceRef}::${normalizedSummary}`)
    .digest("hex");
}

function normalizeForFingerprint(value) {
  return String(value).trim().toLowerCase();
}

function deriveTraceConfidence(evidences) {
  if (evidences.some((evidence) => evidence.strength === "strong")) {
    return "strong";
  }
  if (evidences.some((evidence) => evidence.strength === "medium")) {
    return "medium";
  }
  return "weak";
}

function mapAnomalyType(value) {
  const mapped = ANOMALY_TYPE_TO_DB[value];
  if (!mapped) {
    throw new Error(`unsupported anomaly_type for Aurora trace repository: ${value}`);
  }
  return mapped;
}

function mapEvidenceType(value) {
  const mapped = EVIDENCE_TYPE_TO_CODE[value];
  if (!mapped) {
    throw new Error(`unsupported evidence_type for Aurora trace repository: ${value}`);
  }
  return mapped;
}

function mapEvidenceStrength(value) {
  const mapped = EVIDENCE_STRENGTH_TO_CODE[value ?? "medium"];
  if (!mapped) {
    throw new Error(`unsupported evidence strength for Aurora trace repository: ${value}`);
  }
  return mapped;
}

function projectEvidenceRow(row) {
  return {
    evidence_id: row.evidence_id,
    trace_id: row.trace_id,
    evidence_type: EVIDENCE_CODE_TO_TYPE[row.evdt_cd] ?? null,
    strength: EVIDENCE_CODE_TO_STRENGTH[row.evds_cd] ?? null,
    summary: row.summary,
    source_ref: row.source_ref ?? null,
  };
}

module.exports = {
  AuroraTraceRepository,
};
