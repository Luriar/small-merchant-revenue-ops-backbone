const { randomUUID } = require("node:crypto");

class InMemoryChangeStore {
  constructor() {
    this.byIdempotencyKey = new Map();
  }

  createOrReplay(input) {
    const existing = this.byIdempotencyKey.get(input.idempotency_key);
    if (existing) {
      return {
        statusCode: 200,
        body: {
          change_id: existing.change_id,
          idempotent_replay: true,
          created: false,
        },
      };
    }

    const record = {
      change_id: randomUUID(),
      idempotency_key: input.idempotency_key,
      change_type: input.change_type,
      title: input.title,
      target_service: input.target_service,
      target_component: input.target_component ?? null,
      variation: input.variation ?? null,
      cohort: input.cohort ?? null,
      rule_scope: input.rule_scope ?? null,
      payload: input.payload ?? null,
      actor: input.actor ?? null,
      source: input.source,
      occurred_at: input.occurred_at,
      created_at: new Date().toISOString(),
    };

    this.byIdempotencyKey.set(record.idempotency_key, record);

    return {
      statusCode: 201,
      body: {
        change_id: record.change_id,
        idempotent_replay: false,
        created: true,
      },
    };
  }

  async listChanges({ changeType, targetService, source, limit, cursor }) {
    let items = Array.from(this.byIdempotencyKey.values());

    if (changeType) {
      items = items.filter((item) => item.change_type === changeType);
    }

    if (targetService) {
      items = items.filter((item) => item.target_service === targetService);
    }

    if (source) {
      items = items.filter((item) => item.source === source);
    }

    items = items
      .slice()
      .sort(compareChangesForList)
      .map(projectChangeListItem);

    if (cursor) {
      items = items.filter((item) => isChangeAfterCursor(item, cursor));
    }

    if (Number.isInteger(limit)) {
      items = items.slice(0, limit + 1);
    }

    return { items };
  }

  async getChangeById(changeId) {
    const change = Array.from(this.byIdempotencyKey.values())
      .find((item) => item.change_id === changeId);

    return change ? projectChangeDetail(change) : null;
  }

  async listDashboardChangeMarkers({ targetService, from, to }) {
    let items = Array.from(this.byIdempotencyKey.values());

    if (targetService) {
      items = items.filter((item) => item.target_service === targetService);
    }

    if (from) {
      items = items.filter((item) => item.occurred_at >= from);
    }

    if (to) {
      items = items.filter((item) => item.occurred_at <= to);
    }

    items = items
      .slice()
      .sort(compareChangesForList)
      .map(projectDashboardChangeMarker);

    return { items };
  }

  async listDashboardTimelineItems({ source, limit, cursor }) {
    let items = Array.from(this.byIdempotencyKey.values());

    if (source) {
      items = items.filter((item) => item.source === source);
    }

    items = items
      .slice()
      .sort(compareChangesForList)
      .map(projectChangeTimelineItem);

    if (cursor) {
      items = items.filter((item) => isDashboardTimelineItemAfterCursor(item, cursor));
    }

    if (Number.isInteger(limit)) {
      items = items.slice(0, limit + 1);
    }

    return { items };
  }
}

function compareChangesForList(left, right) {
  const occurredAtComparison = right.occurred_at.localeCompare(left.occurred_at);
  if (occurredAtComparison !== 0) {
    return occurredAtComparison;
  }

  return left.change_id.localeCompare(right.change_id);
}

function projectChangeListItem(change) {
  return {
    change_id: change.change_id,
    change_type: change.change_type,
    title: change.title,
    target_service: change.target_service,
    source: change.source,
    occurred_at: change.occurred_at,
    created_at: change.created_at,
  };
}

function projectChangeDetail(change) {
  return {
    ...projectChangeListItem(change),
    actor_present: hasNonEmptyString(change.actor),
    rule_scope_present: isPlainObject(change.rule_scope),
  };
}

function projectDashboardChangeMarker(change) {
  return {
    change_id: change.change_id,
    title: change.title,
    occurred_at: change.occurred_at,
  };
}

function projectChangeTimelineItem(change) {
  return {
    item_type: "change",
    item_id: change.change_id,
    title: change.title,
    status: null,
    source: change.source,
    occurred_at: change.occurred_at,
  };
}

function isChangeAfterCursor(item, cursor) {
  return item.occurred_at < cursor.occurred_at
    || (item.occurred_at === cursor.occurred_at && item.change_id > cursor.change_id);
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  InMemoryChangeStore,
};
