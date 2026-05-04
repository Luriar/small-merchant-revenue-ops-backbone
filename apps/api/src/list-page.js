function buildListPage({ requestedLimit, totalFetched, nextCursor }) {
  const hasMore = Number.isInteger(requestedLimit) && totalFetched > requestedLimit;

  return {
    limit: requestedLimit,
    has_more: hasMore,
    next_cursor: hasMore ? nextCursor : null,
  };
}

function sliceListItems(items, requestedLimit) {
  if (!Number.isInteger(requestedLimit)) {
    return items;
  }

  return items.slice(0, requestedLimit);
}

function buildListResponse({ items, requestedLimit, nextCursorBuilder }) {
  const pageItems = sliceListItems(items, requestedLimit);
  let nextCursor = null;
  if (Number.isInteger(requestedLimit) && items.length > requestedLimit && typeof nextCursorBuilder === "function") {
    nextCursor = encodeOpaqueCursor(nextCursorBuilder(pageItems[pageItems.length - 1]));
  }

  return {
    items: pageItems,
    page: buildListPage({
      requestedLimit,
      totalFetched: items.length,
      nextCursor,
    }),
  };
}

function encodeOpaqueCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeOpaqueCursor(cursor) {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return isPlainObject(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function parseTypedCursor(cursor, { expectedType, requiredKeys }) {
  if (cursor === null) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed = decodeOpaqueCursor(cursor);
  if (!parsed || parsed.type !== expectedType) {
    return {
      value: null,
      error: "cursor is invalid",
    };
  }

  for (const key of requiredKeys) {
    if (typeof parsed[key] !== "string" || parsed[key].length === 0) {
      return {
        value: null,
        error: "cursor is invalid",
      };
    }

    if (key.endsWith("_at") && Number.isNaN(new Date(parsed[key]).getTime())) {
      return {
        value: null,
        error: "cursor is invalid",
      };
    }
  }

  return {
    value: parsed,
    error: null,
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  buildListPage,
  buildListResponse,
  encodeOpaqueCursor,
  parseTypedCursor,
  sliceListItems,
};
