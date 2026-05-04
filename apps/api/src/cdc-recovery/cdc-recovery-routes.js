const { createCdcRecoveryHandler } = require("./cdc-recovery-handler");
const { validationError, mapCdcRecoveryError } = require("./cdc-recovery-errors");
const { createTestRouteService, matchRoute } = require("./test-support/cdc-recovery-test-harness");
const { createCdcRecoveryStubRepository } = require("./test-support/cdc-recovery-stub-repository");

const CDC_ROLE_CREDENTIAL_ENV = Object.freeze([
  ["CDC_READONLY_BEARER_TOKEN", "readonly_role"],
  ["CDC_OPERATOR_BEARER_TOKEN", "operator"],
  ["CDC_MAINTAINER_BEARER_TOKEN", "maintainer"],
  ["CDC_SYSTEM_WORKER_BEARER_TOKEN", "system_worker"],
]);

const BASELINE_ROLE_COMPATIBILITY = new Map([
  ["viewer", "readonly_role"],
  ["operator", "operator"],
]);

const MAX_SAFE_INPUT_BYTES = 64 * 1024;

function createCdcRecoveryRouteDispatcher({
  env = process.env,
  authConfig = null,
  repository = createCdcRecoveryStubRepository(),
  roleResolver = null,
} = {}) {
  const service = createTestRouteService({ repository });
  const resolveRole = roleResolver ?? ((request) => resolveCdcRecoveryRole({ request, env, authConfig }));
  const handler = createCdcRecoveryHandler({
    service,
    authorize: authorizeCdcRecoveryRole,
  });

  return {
    matches(request) {
      return isCdcRecoveryRequest(request);
    },
    async handle(request, response) {
      const routePath = sanitizePath(request?.url);
      const match = matchRoute({ method: request?.method, path: routePath });
      if (!match) {
        return false;
      }

      const role = resolveRole(request);
      const input = request.method === "POST" ? await readJsonInput(request) : null;
      const context = {
        authenticated: typeof role === "string" && role.length > 0,
        role,
        ...match.routeParams,
        input,
        operatorIdentity: typeof role === "string" ? `${role}_route_ref` : null,
      };

      try {
        const result = await handler[match.handlerMethod](context);
        const normalized = normalizeRouteResult(result, match.successStatus);
        writeJson(response, normalized.statusCode, normalized.value);
        return true;
      } catch (error) {
        const mapped = mapCdcRecoveryError(error);
        writeJson(response, mapped.statusCode, mapped.value);
        return true;
      }
    },
    repository,
  };
}

function authorizeCdcRecoveryRole(context, allowedRoles) {
  if (!context?.authenticated) {
    throw validationAwareUnauthorized();
  }

  if (!allowedRoles.includes(context.role)) {
    throw validationAwareForbidden();
  }
}

function validationAwareUnauthorized() {
  const { unauthorizedError } = require("./cdc-recovery-errors");
  return unauthorizedError();
}

function validationAwareForbidden() {
  const { forbiddenError } = require("./cdc-recovery-errors");
  return forbiddenError();
}

function normalizeRouteResult(result, fallbackStatus) {
  if (result?.ok === false && result.error) {
    return mapCdcRecoveryError(result.error);
  }

  if (result?.kind === "conflict" && result.error) {
    return mapCdcRecoveryError(result.error);
  }

  if (result?.kind === "duplicate") {
    return {
      statusCode: result.statusCode ?? 200,
      value: result.value,
    };
  }

  if (result?.value) {
    return {
      statusCode: result.statusCode ?? fallbackStatus,
      value: result.value,
    };
  }

  return {
    statusCode: fallbackStatus,
    value: result,
  };
}

function resolveCdcRecoveryRole({ request, env, authConfig }) {
  const credential = readBearerCredential(request);
  if (!credential) {
    return null;
  }

  for (const [envKey, role] of CDC_ROLE_CREDENTIAL_ENV) {
    if (normalizeCredential(env?.[envKey]) === credential) {
      return role;
    }
  }

  const baselineRole = authConfig?.tokens?.get(credential);
  return BASELINE_ROLE_COMPATIBILITY.get(baselineRole) ?? null;
}

function readBearerCredential(request) {
  const headerValue = getHeaderValue(request, "authorization");
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  return match ? match[1] : null;
}

async function readJsonInput(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_SAFE_INPUT_BYTES) {
      throw validationError("validation failed");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw validationError("validation failed");
  }
}

function isCdcRecoveryRequest(request) {
  const path = sanitizePath(request?.url);
  return typeof path === "string" && path.startsWith("/api/v1/cdc/");
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return null;
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
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

function normalizeCredential(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

module.exports = {
  CDC_ROLE_CREDENTIAL_ENV,
  BASELINE_ROLE_COMPATIBILITY,
  createCdcRecoveryRouteDispatcher,
  resolveCdcRecoveryRole,
};
