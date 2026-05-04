const { createHash, randomUUID } = require("node:crypto");

const { TRACE_STATUS } = require("../../../packages/contracts/trace-create");

class InMemoryTraceStore {
  constructor() {
    this.traceKeyToTraceId = new Map();
    this.tracesById = new Map();
  }

  createOrReuseTraceWithEvidence(input) {
    const traceKey = buildTraceKey(input);
    let trace = null;
    let traceCreated = false;

    const existingTraceId = this.traceKeyToTraceId.get(traceKey);
    if (existingTraceId) {
      trace = this.tracesById.get(existingTraceId);
    } else {
      trace = {
        trace_id: randomUUID(),
        status: TRACE_STATUS,
        change_id: input.change_id,
        primary_issue_id: input.primary_issue_id,
        confidence: deriveTraceConfidence(input.evidences),
        anomaly_type: input.anomaly_type,
        anomaly_metric: input.anomaly_metric,
        anomaly_window_start: input.anomaly_window_start,
        anomaly_window_end: input.anomaly_window_end,
        created_at: new Date().toISOString(),
        evidences: [],
        evidenceFingerprints: new Set(),
      };
      this.traceKeyToTraceId.set(traceKey, trace.trace_id);
      this.tracesById.set(trace.trace_id, trace);
      traceCreated = true;
    }

    let createdEvidenceCount = 0;
    let skippedEvidenceCount = 0;

    for (const evidence of input.evidences) {
      const fingerprint = buildEvidenceFingerprint(trace.trace_id, evidence);
      if (trace.evidenceFingerprints.has(fingerprint)) {
        skippedEvidenceCount += 1;
        continue;
      }

      trace.evidenceFingerprints.add(fingerprint);
      trace.evidences.push({
        evidence_id: randomUUID(),
        trace_id: trace.trace_id,
        evidence_type: evidence.evidence_type,
        source_ref: evidence.source_ref,
        summary: evidence.summary,
        strength: evidence.strength ?? null,
        payload: evidence.payload ?? null,
        fingerprint,
        created_at: new Date().toISOString(),
      });
      createdEvidenceCount += 1;
    }

    return {
      trace_id: trace.trace_id,
      trace_created: traceCreated,
      trace_reused: !traceCreated,
      evidence_count: trace.evidences.length,
      evidence_created_count: createdEvidenceCount,
      evidence_skipped_count: skippedEvidenceCount,
    };
  }

  async listTraces({ status, changeId, primaryIssueId, limit, cursor }) {
    let items = Array.from(this.tracesById.values()).map(projectTraceListItem);

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    if (changeId) {
      items = items.filter((item) => item.change_id === changeId);
    }

    if (primaryIssueId) {
      items = items.filter((item) => item.primary_issue_id === primaryIssueId);
    }

    items.sort(compareTraceListItem);

    if (cursor) {
      items = items.filter((item) => isTraceAfterCursor(item, cursor));
    }

    if (limit !== null && limit !== undefined) {
      items = items.slice(0, limit + 1);
    }

    return { items };
  }

  async getTraceById(traceId) {
    const trace = this.tracesById.get(traceId);
    if (!trace) {
      return null;
    }

    return projectTraceDetail(trace);
  }

  async listTraceEvidences(traceId) {
    const trace = this.tracesById.get(traceId);
    if (!trace) {
      return { items: [] };
    }

    return {
      items: trace.evidences
        .slice()
        .sort(compareEvidenceItem)
        .map(projectTraceEvidenceItem),
    };
  }

  async getOverviewSummary() {
    const traces = Array.from(this.tracesById.values());
    const metrics = new Set();

    return {
      changes: countDistinctPresent(traces, "change_id"),
      detected_anomaly_patterns: countDistinctAnomalyPatterns(traces),
      linked_issues: countDistinctPresent(traces, "primary_issue_id"),
      suspected_traces: countTracesByStatus(traces, "suspected"),
      confirmed_traces: countTracesByStatus(traces, "confirmed"),
      dismissed_traces: countTracesByStatus(traces, "dismissed"),
      scope_from: minPresent(traces.map((trace) => trace.anomaly_window_start)),
      scope_to: maxPresent(traces.map((trace) => trace.anomaly_window_end)),
      primary_metric: resolveSinglePresentValue(traces, "anomaly_metric", metrics),
    };
  }
}

function buildTraceKey(input) {
  return [
    input.change_id,
    input.primary_issue_id,
    input.anomaly_type,
    input.anomaly_metric,
    input.anomaly_window_start,
    input.anomaly_window_end,
  ].join("::");
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

function compareTraceListItem(left, right) {
  const createdAtComparison = right.created_at.localeCompare(left.created_at);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.trace_id.localeCompare(right.trace_id);
}

function projectTraceListItem(trace) {
  return {
    trace_id: trace.trace_id,
    change_id: trace.change_id ?? null,
    primary_issue_id: trace.primary_issue_id ?? null,
    status: trace.status,
    confidence: trace.confidence,
    anomaly_type: trace.anomaly_type,
    anomaly_metric: trace.anomaly_metric,
    anomaly_window_start: trace.anomaly_window_start,
    anomaly_window_end: trace.anomaly_window_end,
    created_at: trace.created_at,
  };
}

function projectTraceDetail(trace) {
  return {
    ...projectTraceListItem(trace),
    evidence_count: trace.evidences.length,
  };
}

function compareEvidenceItem(left, right) {
  const createdAtComparison = String(left.created_at).localeCompare(String(right.created_at));
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.evidence_id.localeCompare(right.evidence_id);
}

function projectTraceEvidenceItem(evidence) {
  return {
    evidence_id: evidence.evidence_id,
    trace_id: evidence.trace_id,
    evidence_type: evidence.evidence_type,
    strength: evidence.strength ?? null,
    summary: evidence.summary,
    source_ref: evidence.source_ref ?? null,
  };
}

function isTraceAfterCursor(item, cursor) {
  return item.created_at < cursor.created_at
    || (item.created_at === cursor.created_at && item.trace_id > cursor.trace_id);
}

function countTracesByStatus(traces, status) {
  return traces.filter((trace) => trace.status === status).length;
}

function countDistinctPresent(items, key) {
  return new Set(
    items
      .map((item) => item[key])
      .filter((value) => typeof value === "string" && value.trim().length > 0),
  ).size;
}

function countDistinctAnomalyPatterns(traces) {
  return new Set(
    traces.map((trace) => [
      trace.anomaly_type ?? "",
      trace.anomaly_metric ?? "",
      trace.anomaly_window_start ?? "",
      trace.anomaly_window_end ?? "",
    ].join("::")),
  ).size;
}

function minPresent(values) {
  const presentValues = values.filter((value) => typeof value === "string" && value.trim().length > 0);
  return presentValues.length > 0 ? presentValues.sort()[0] : null;
}

function maxPresent(values) {
  const presentValues = values.filter((value) => typeof value === "string" && value.trim().length > 0);
  return presentValues.length > 0 ? presentValues.sort()[presentValues.length - 1] : null;
}

function resolveSinglePresentValue(items, key, scratchSet = new Set()) {
  scratchSet.clear();
  for (const item of items) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) {
      scratchSet.add(value);
    }
  }

  return scratchSet.size === 1 ? Array.from(scratchSet)[0] : null;
}

module.exports = {
  InMemoryTraceStore,
};
