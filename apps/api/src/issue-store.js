const { randomUUID } = require("node:crypto");

class InMemoryIssueStore {
  constructor() {
    this.byId = new Map();
    this.bySourceExternalId = new Map();
    this.byIdempotencyKey = new Map();
  }

  createOrReplay(input) {
    const sourceExternalIdKey = buildSourceExternalIdKey(input.source, input.external_id);
    if (sourceExternalIdKey) {
      const existingByExternal = this.bySourceExternalId.get(sourceExternalIdKey);
      if (existingByExternal) {
        return replayResponse(existingByExternal.issue_id);
      }
    }

    if (input.idempotency_key) {
      const existingByIdempotency = this.byIdempotencyKey.get(input.idempotency_key);
      if (existingByIdempotency) {
        return replayResponse(existingByIdempotency.issue_id);
      }
    }

    const createdAt = new Date().toISOString();
    const record = {
      issue_id: randomUUID(),
      idempotency_key: input.idempotency_key ?? null,
      external_id: input.external_id ?? null,
      source: input.source,
      title: input.title,
      body: input.body ?? null,
      issue_family: input.issue_family,
      severity: input.severity,
      keywords: input.keywords ?? null,
      affected_variation: input.affected_variation ?? null,
      payload: input.payload ?? null,
      reporter: input.reporter ?? null,
      occurred_at: input.occurred_at,
      created_at: createdAt,
      // Status/version/timestamps are initialized so that the status update
      // path can enforce optimistic locking against newly-intaken issues.
      status: "open",
      version: 1,
      updated_at: createdAt,
      resolved_at: null,
    };

    if (sourceExternalIdKey) {
      this.bySourceExternalId.set(sourceExternalIdKey, record);
    }

    if (record.idempotency_key) {
      this.byIdempotencyKey.set(record.idempotency_key, record);
    }

    this.byId.set(record.issue_id, record);

    return {
      statusCode: 201,
      body: {
        issue_id: record.issue_id,
        idempotent_replay: false,
        created: true,
      },
    };
  }

  async listIssues({ issueFamily, severity, status, source, limit, cursor }) {
    let items = Array.from(this.byId.values());

    if (issueFamily) {
      items = items.filter((item) => item.issue_family === issueFamily);
    }

    if (severity !== null) {
      items = items.filter((item) => item.severity === severity);
    }

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    if (source) {
      items = items.filter((item) => item.source === source);
    }

    items = items
      .slice()
      .sort(compareIssuesForList)
      .map(projectIssueListItem);

    if (cursor) {
      items = items.filter((item) => isIssueAfterCursor(item, cursor));
    }

    if (Number.isInteger(limit)) {
      items = items.slice(0, limit + 1);
    }

    return { items };
  }

  async getIssueById(issueId) {
    const issue = this.byId.get(issueId);
    return issue ? projectIssueDetail(issue) : null;
  }

  async updateIssueStatus({ issueId, status, expectedVersion }) {
    const issue = this.byId.get(issueId);
    if (!issue) {
      return { kind: "not_found" };
    }

    const currentVersion = typeof issue.version === "number" ? issue.version : 1;
    if (currentVersion !== expectedVersion) {
      return { kind: "version_conflict" };
    }

    const previousStatus = issue.status ?? "open";
    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();

    issue.status = status;
    issue.version = nextVersion;
    issue.updated_at = now;
    if (status === "resolved" && !issue.resolved_at) {
      // Mirrors the Aurora trg_auto_set_resolved_at trigger: set on the
      // first transition into resolved, and do not auto-clear on later
      // transitions away from resolved.
      issue.resolved_at = now;
    }

    return {
      kind: "ok",
      body: {
        issue_id: issue.issue_id,
        previous_status: previousStatus,
        current_status: status,
        previous_version: currentVersion,
        current_version: nextVersion,
      },
    };
  }

  async listDashboardTimelineItems({ source, limit, cursor }) {
    let items = Array.from(this.byId.values());

    if (source) {
      items = items.filter((item) => item.source === source);
    }

    items = items
      .slice()
      .sort(compareIssuesForTimeline)
      .map(projectIssueTimelineItem);

    if (cursor) {
      items = items.filter((item) => isDashboardTimelineItemAfterCursor(item, cursor));
    }

    if (Number.isInteger(limit)) {
      items = items.slice(0, limit + 1);
    }

    return { items };
  }
}

function buildSourceExternalIdKey(source, externalId) {
  if (!source || !externalId) {
    return null;
  }

  return `${source}::${externalId}`;
}

function replayResponse(issueId) {
  return {
    statusCode: 200,
    body: {
      issue_id: issueId,
      idempotent_replay: true,
      created: false,
    },
  };
}

function compareIssuesForList(left, right) {
  const createdAtComparison = right.created_at.localeCompare(left.created_at);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.issue_id.localeCompare(right.issue_id);
}

function compareIssuesForTimeline(left, right) {
  const leftOccurredAt = left.occurred_at ?? left.created_at;
  const rightOccurredAt = right.occurred_at ?? right.created_at;
  const occurredAtComparison = String(rightOccurredAt).localeCompare(String(leftOccurredAt));
  if (occurredAtComparison !== 0) {
    return occurredAtComparison;
  }

  return left.issue_id.localeCompare(right.issue_id);
}

function projectIssueListItem(issue) {
  return {
    issue_id: issue.issue_id,
    summary: deriveIssueSummary(issue),
    issue_family: issue.issue_family,
    severity: issue.severity,
    status: issue.status ?? "open",
    source: issue.source,
    external_id_present: issue.external_id !== null,
    created_at: issue.created_at,
  };
}

function projectIssueDetail(issue) {
  return {
    ...projectIssueListItem(issue),
    reporter_present: hasNonEmptyString(issue.reporter),
    affected_variation_present: hasNonEmptyString(issue.affected_variation),
    keywords_count: Array.isArray(issue.keywords) ? issue.keywords.length : 0,
    body_present: hasNonEmptyString(issue.body),
  };
}

function projectIssueTimelineItem(issue) {
  return {
    item_type: "issue",
    item_id: issue.issue_id,
    summary: deriveIssueSummary(issue),
    status: issue.status ?? "open",
    source: issue.source,
    occurred_at: issue.occurred_at ?? issue.created_at,
  };
}

function deriveIssueSummary(issue) {
  return hasNonEmptyString(issue.issue_family) ? issue.issue_family : "Issue summary unavailable";
}

function isIssueAfterCursor(item, cursor) {
  return item.created_at < cursor.created_at
    || (item.created_at === cursor.created_at && item.issue_id > cursor.issue_id);
}

function isDashboardTimelineItemAfterCursor(item, cursor) {
  return item.occurred_at < cursor.occurred_at
    || (
      item.occurred_at === cursor.occurred_at
      && (
        item.item_type > cursor.item_type
        || (item.item_type === cursor.item_type && item.item_id > cursor.item_id)
      )
    );
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  InMemoryIssueStore,
};
