const { configInvalid, forbidden, unauthorized } = require("./error-response");

const ROLE_PRECEDENCE = Object.freeze({
  viewer: 1,
  operator: 2,
});

const AUTH_ROUTE_POLICIES = Object.freeze([
  { method: "GET", pattern: /^\/healthz$/, access: "exempt" },
  { method: "GET", pattern: /^\/readyz$/, access: "exempt" },
  { method: "GET", pattern: /^\/api\/v1\/dashboard\/overview$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/dashboard\/timeline$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/runs$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/overview$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/failures$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/[^/]+$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/[^/]+\/state-log$/, access: "viewer" },
  { method: "POST", pattern: /^\/api\/v1\/runs\/[^/]+\/retry$/, access: "operator" },
  { method: "GET", pattern: /^\/api\/v1\/changes$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/changes\/[^/]+$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/changes\/[^/]+\/traces$/, access: "viewer" },
  { method: "POST", pattern: /^\/api\/v1\/changes$/, access: "operator" },
  { method: "POST", pattern: /^\/api\/v1\/events\/intake$/, access: "operator" },
  { method: "GET", pattern: /^\/api\/v1\/issues$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/issues\/[^/]+$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/issues\/[^/]+\/traces$/, access: "viewer" },
  { method: "POST", pattern: /^\/api\/v1\/issues\/intake$/, access: "operator" },
  { method: "PATCH", pattern: /^\/api\/v1\/issues\/[^/]+\/status$/, access: "operator" },
  { method: "POST", pattern: /^\/api\/v1\/reprocess$/, access: "operator" },
  { method: "GET", pattern: /^\/api\/v1\/traces$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+\/evidences$/, access: "viewer" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+\/primary-issue$/, access: "viewer" },
  { method: "POST", pattern: /^\/api\/v1\/traces$/, access: "operator" },
]);

function getAuthConfig({ env = process.env } = {}) {
  const viewerToken = normalizeToken(env.VIEWER_BEARER_TOKEN);
  const operatorToken = normalizeToken(env.OPERATOR_BEARER_TOKEN);
  const tokens = new Map();

  if (viewerToken) {
    tokens.set(viewerToken, "viewer");
  }

  if (operatorToken) {
    tokens.set(operatorToken, "operator");
  }

  return {
    enabled: tokens.size > 0,
    viewerToken,
    operatorToken,
    tokens,
  };
}

function validateAuthConfig({ env = process.env } = {}) {
  const config = getAuthConfig({ env });

  if (config.viewerToken && config.operatorToken && config.viewerToken === config.operatorToken) {
    throw configInvalid(
      "startup config invalid: VIEWER_BEARER_TOKEN and OPERATOR_BEARER_TOKEN must be distinct",
    );
  }

  return config;
}

function enforceAuthorization({ request, authConfig }) {
  if (!authConfig?.enabled) {
    return null;
  }

  const policy = matchAuthPolicy(request);
  if (!policy || policy.access === "exempt") {
    return null;
  }

  const token = getBearerToken(request);
  if (!token) {
    throw unauthorized("unauthorized");
  }

  const role = authConfig.tokens.get(token);
  if (!role) {
    throw unauthorized("unauthorized");
  }

  if (!hasRequiredRole(role, policy.access)) {
    throw forbidden("forbidden");
  }

  return {
    role,
    requiredRole: policy.access,
  };
}

function matchAuthPolicy(request) {
  const path = sanitizePath(request?.url);
  if (!path) {
    return null;
  }

  for (const policy of AUTH_ROUTE_POLICIES) {
    if (policy.method === request?.method && policy.pattern.test(path)) {
      return policy;
    }
  }

  return null;
}

function getBearerToken(request) {
  const headerValue = getHeaderValue(request, "authorization");
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  if (!match) {
    return null;
  }

  return match[1];
}

function getHeaderValue(request, headerName) {
  if (!request?.headers || typeof request.headers !== "object") {
    return null;
  }

  const value = request.headers[headerName];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  return typeof value === "string" ? value : null;
}

function hasRequiredRole(actualRole, requiredRole) {
  return (ROLE_PRECEDENCE[actualRole] ?? 0) >= (ROLE_PRECEDENCE[requiredRole] ?? Number.MAX_SAFE_INTEGER);
}

function normalizeToken(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return null;
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

module.exports = {
  ROLE_PRECEDENCE,
  AUTH_ROUTE_POLICIES,
  getAuthConfig,
  validateAuthConfig,
  enforceAuthorization,
  matchAuthPolicy,
};
