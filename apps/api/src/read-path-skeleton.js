const { TRACE_ID, staticReadPathRepository } = require("./read-path-static-repository");

// Frontend/API contract skeleton only. Future repositories should read
// changes/traces/issues/runs/evidence from Aurora and timeline/anomaly markers
// from the ClickHouse read model.
const READ_PATH_SKELETON_ROUTES = Object.freeze([
  /^\/api\/v1\/dashboard\/overview$/,
  /^\/api\/v1\/dashboard\/timeline$/,
  /^\/api\/v1\/traces$/,
  /^\/api\/v1\/traces\/[^/]+$/,
  /^\/api\/v1\/traces\/[^/]+\/evidences$/,
  /^\/api\/v1\/traces\/[^/]+\/primary-issue$/,
  /^\/api\/v1\/changes$/,
  /^\/api\/v1\/changes\/[^/]+$/,
  /^\/api\/v1\/changes\/[^/]+\/traces$/,
  /^\/api\/v1\/runs$/,
  /^\/api\/v1\/runs\/overview$/,
  /^\/api\/v1\/runs\/failures$/,
  /^\/api\/v1\/runs\/[^/]+$/,
  /^\/api\/v1\/runs\/[^/]+\/state-log$/,
  /^\/api\/v1\/issues$/,
  /^\/api\/v1\/issues\/[^/]+$/,
  /^\/api\/v1\/issues\/[^/]+\/traces$/,
]);

function isReadPathSkeletonRoute(request) {
  if (request?.method !== "GET") {
    return false;
  }

  const path = sanitizePath(request.url);
  return READ_PATH_SKELETON_ROUTES.some((pattern) => pattern.test(path));
}

function handleReadPathSkeleton({ request, response, repository = staticReadPathRepository }) {
  const path = sanitizePath(request.url);

  if (path === "/api/v1/dashboard/overview") {
    return writeJson(response, 200, repository.getDashboardOverview());
  }

  if (path === "/api/v1/dashboard/timeline") {
    return writeJson(response, 200, repository.getDashboardTimeline());
  }

  if (path === "/api/v1/traces") {
    return writeJson(response, 200, repository.listTraces());
  }

  const traceEvidencesMatch = path.match(/^\/api\/v1\/traces\/([^/]+)\/evidences$/);
  if (traceEvidencesMatch) {
    return handleNullableResponse({
      response,
      body: repository.listTraceEvidences(decodeURIComponent(traceEvidencesMatch[1])),
      missingMessage: "trace not found",
    });
  }

  const tracePrimaryIssueMatch = path.match(/^\/api\/v1\/traces\/([^/]+)\/primary-issue$/);
  if (tracePrimaryIssueMatch) {
    return handleNullableResponse({
      response,
      body: repository.getTracePrimaryIssue(decodeURIComponent(tracePrimaryIssueMatch[1])),
      missingMessage: "trace not found",
    });
  }

  const traceDetailMatch = path.match(/^\/api\/v1\/traces\/([^/]+)$/);
  if (traceDetailMatch) {
    return handleNullableResponse({
      response,
      body: repository.getTraceDetail(decodeURIComponent(traceDetailMatch[1])),
      missingMessage: "trace not found",
    });
  }

  if (path === "/api/v1/changes") {
    return writeJson(response, 200, repository.listChanges());
  }

  const changeTracesMatch = path.match(/^\/api\/v1\/changes\/([^/]+)\/traces$/);
  if (changeTracesMatch) {
    return handleNullableResponse({
      response,
      body: repository.listChangeTraces(decodeURIComponent(changeTracesMatch[1])),
      missingMessage: "change not found",
    });
  }

  const changeDetailMatch = path.match(/^\/api\/v1\/changes\/([^/]+)$/);
  if (changeDetailMatch) {
    return handleNullableResponse({
      response,
      body: repository.getChangeDetail(decodeURIComponent(changeDetailMatch[1])),
      missingMessage: "change not found",
    });
  }

  if (path === "/api/v1/runs") {
    return writeJson(response, 200, repository.listRuns());
  }

  if (path === "/api/v1/runs/overview") {
    return writeJson(response, 200, repository.getRunOverview());
  }

  if (path === "/api/v1/runs/failures") {
    return writeJson(response, 200, repository.getRunFailures());
  }

  const runStateLogMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/state-log$/);
  if (runStateLogMatch) {
    return handleNullableResponse({
      response,
      body: repository.listRunStateLog(decodeURIComponent(runStateLogMatch[1])),
      missingMessage: "run not found",
    });
  }

  const runDetailMatch = path.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    return handleNullableResponse({
      response,
      body: repository.getRunDetail(decodeURIComponent(runDetailMatch[1])),
      missingMessage: "run not found",
    });
  }

  if (path === "/api/v1/issues") {
    return writeJson(response, 200, repository.listIssues());
  }

  const issueTracesMatch = path.match(/^\/api\/v1\/issues\/([^/]+)\/traces$/);
  if (issueTracesMatch) {
    return handleNullableResponse({
      response,
      body: repository.listIssueTraces(decodeURIComponent(issueTracesMatch[1])),
      missingMessage: "issue not found",
    });
  }

  const issueDetailMatch = path.match(/^\/api\/v1\/issues\/([^/]+)$/);
  if (issueDetailMatch) {
    return handleNullableResponse({
      response,
      body: repository.getIssueDetail(decodeURIComponent(issueDetailMatch[1])),
      missingMessage: "issue not found",
    });
  }

  return writeJson(response, 404, notFoundBody());
}

function shouldUseReadPathSkeleton({
  changeStore,
  issueStore,
  runStore,
  traceStore,
  startupConfig,
}) {
  const hasInjectedReadStore = Boolean(changeStore || issueStore || runStore || traceStore);
  const hasAuroraReadBackend = (startupConfig?.auroraBackends ?? []).some((backendKey) => (
    backendKey === "CHANGE_STORE_BACKEND"
      || backendKey === "ISSUE_STORE_BACKEND"
      || backendKey === "RUN_STORE_BACKEND"
      || backendKey === "TRACE_STORE_BACKEND"
  ));

  return !hasInjectedReadStore && !hasAuroraReadBackend;
}

function handleNullableResponse({ response, body, missingMessage }) {
  if (!body) {
    return writeJson(response, 404, notFoundBody(missingMessage));
  }

  return writeJson(response, 200, body);
}

function notFoundBody(message = "route not found") {
  return {
    error: {
      code: "not_found",
      message,
    },
  };
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return "";
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

module.exports = {
  TRACE_ID,
  handleReadPathSkeleton,
  isReadPathSkeletonRoute,
  shouldUseReadPathSkeleton,
};
