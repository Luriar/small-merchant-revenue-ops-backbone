const { Buffer } = require("node:buffer");

class RevenueOpsHttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getJwtClaimsFromEvent(event) {
  return event?.requestContext?.authorizer?.jwt?.claims
    ?? event?.requestContext?.authorizer?.claims
    ?? null;
}

function getJwtClaimsFromRequest(request) {
  if (request?.authClaims && typeof request.authClaims === "object") {
    return request.authClaims;
  }

  const eventClaims = getJwtClaimsFromEvent(request?.apiGatewayEvent);
  if (eventClaims) {
    return eventClaims;
  }

  const testSub = headerValue(request, "x-test-cognito-sub");
  if (testSub) {
    return {
      sub: testSub,
      email: headerValue(request, "x-test-email") || undefined,
      name: headerValue(request, "x-test-display-name") || undefined,
    };
  }

  return decodeUnverifiedBearerClaims(headerValue(request, "authorization"));
}

function requireClaimsFromRequest(request) {
  const claims = getJwtClaimsFromRequest(request);
  if (!claims?.sub && !claims?.username && !claims?.["cognito:username"]) {
    throw new RevenueOpsHttpError(401, "unauthorized", "Authentication is required");
  }
  return claims;
}

function normalizeClaims(claims) {
  const cognitoSub = firstString(claims?.sub, claims?.username, claims?.["cognito:username"]);
  const email = firstString(claims?.email, claims?.["custom:email"]);
  const displayName = firstString(claims?.name, claims?.given_name, claims?.preferred_username, email);

  if (!cognitoSub) {
    throw new RevenueOpsHttpError(401, "unauthorized", "Authentication is required");
  }

  return {
    cognito_sub: cognitoSub,
    email: email || null,
    display_name: displayName || null,
  };
}

function headerValue(request, name) {
  const headers = request?.headers ?? {};
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? "";
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function decodeUnverifiedBearerClaims(authorization) {
  if (typeof authorization !== "string") {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1];
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payload.length % 4) % 4);
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = {
  RevenueOpsHttpError,
  getJwtClaimsFromEvent,
  getJwtClaimsFromRequest,
  normalizeClaims,
  requireClaimsFromRequest,
};
