const http = require("node:http");

const { enforceAuthorization } = require("./auth");
const { handleRouteError } = require("./error-response");
const { registerGracefulShutdown } = require("./graceful-shutdown");
const { createNoopMetricsEmitter } = require("./metrics");
const { attachRequestContext } = require("./request-context");
const { handleChangeDetail, handleChangeIntake, handleChangeList, handleChangeTraces } = require("./change-handler");
const { createChangeStoreFromEnv } = require("./change-store-factory");
const { handleDashboardOverview, handleDashboardTimeline } = require("./dashboard-handler");
const { handleEventIntake } = require("./event-handler");
const { createEventStoreFromEnv } = require("./event-store-factory");
const { handleIssueDetail, handleIssueIntake, handleIssueList, handleIssueStatusUpdate, handleIssueTraces } = require("./issue-handler");
const { createIssueStoreFromEnv } = require("./issue-store-factory");
const { handleReadPathSkeleton, isReadPathSkeletonRoute, shouldUseReadPathSkeleton } = require("./read-path-skeleton");
const { handleRetryRun } = require("./retry-handler");
const { createRunStoreFromEnv } = require("./run-store-factory");
const { handleRunDetail, handleRunFailures, handleRunList, handleRunOverview, handleRunStateLog } = require("./run-read-handler");
const { handleReprocessRun } = require("./reprocess-handler");
const { getStartupConfig, validateStartupConfig } = require("./startup-config");
const { handleTraceCreate, handleTraceDetail, handleTraceEvidences, handleTraceList, handleTracePrimaryIssue } = require("./trace-handler");
const { createTraceStoreFromEnv } = require("./trace-store-factory");
const { createCdcRecoveryRouteDispatcher } = require("./cdc-recovery/cdc-recovery-routes");
const { createRevenueOpsStore } = require("./revenue-ops/revenue-ops-store");
const { createRevenueOpsSaasStoreFromEnv } = require("./revenue-ops/revenue-ops-saas-store-factory");
const { createOptionalAuroraActionStatusStoreFromEnv } = require("./revenue-ops/aurora-action-status-store");
const {
  handleGetBriefs,
  handleGetBriefById,
  handleGetAnomalies,
  handleGetEvidenceForAnomaly,
  handleGetActions,
  handleUpdateActionStatus,
  handleGetContext,
  handleGetPipelineMeta,
  handleGetMe,
  handleListStores,
  handleCreateStore,
  handleUpdateStore,
  handleArchiveStore,
  handleGetStoreBriefs,
  handleGetStoreAnomalies,
  handleGetStoreActions,
  handleUpdateStoreActionStatus,
  handleGetStoreContext,
  handleGetStorePipelineMeta,
  handleListRevenueUploads,
  handleCreateRevenueUpload,
  handlePreviewRevenueUpload,
  handleListRejectedRevenueRows,
  handleReprocessRevenueUpload,
  handleCollectStoreContext,
  handleGetStoreCauseCandidates,
  handleGetStoreCauseCandidate,
} = require("./revenue-ops/revenue-ops-handler");
const { handleGetAuroraHealth } = require("./revenue-ops/aurora-health");

const _revenueOpsStore = createRevenueOpsStore();

function createLogger() {
  return {
    info(event, fields) {
      process.stdout.write(`${JSON.stringify({ level: "info", event, ...fields })}\n`);
    },
  };
}

function createServer({
  env = process.env,
  changeStore,
  eventStore,
  issueStore,
  runStore,
  traceStore,
  cdcRecoveryRoutes,
  revenueOpsStore,
  revenueOpsSaasStore,
  readPathSkeleton = false,
  logger = createLogger(),
  metrics = createNoopMetricsEmitter(),
} = {}) {
  const startupConfig = validateStartupConfig({ env });
  const useReadPathSkeleton = readPathSkeleton && shouldUseReadPathSkeleton({
    changeStore,
    issueStore,
    runStore,
    traceStore,
    startupConfig,
  });
  const resolvedChangeStore = changeStore ?? createChangeStoreFromEnv({ env });
  const resolvedEventStore = eventStore ?? createEventStoreFromEnv({ env });
  const resolvedIssueStore = issueStore ?? createIssueStoreFromEnv({ env });
  const resolvedRunStore = runStore ?? createRunStoreFromEnv({ env });
  const resolvedTraceStore = traceStore ?? createTraceStoreFromEnv({ env });
  const resolvedCdcRecoveryRoutes = cdcRecoveryRoutes ?? createCdcRecoveryRouteDispatcher({
    env,
    authConfig: startupConfig.authConfig,
  });
  const resolvedRevenueOpsStore = revenueOpsStore ?? _revenueOpsStore;
  const resolvedRevenueOpsSaasStore = revenueOpsSaasStore ?? createRevenueOpsSaasStoreFromEnv({ env, logger });

  return http.createServer((request, response) => {
    const requestContext = attachRequestContext({ request, response, logger, metrics });

    Promise.resolve()
      .then(() => dispatchRequest({
        request,
        response,
        logger: requestContext.logger,
        changeStore: resolvedChangeStore,
        eventStore: resolvedEventStore,
        issueStore: resolvedIssueStore,
        runStore: resolvedRunStore,
        traceStore: resolvedTraceStore,
        cdcRecoveryRoutes: resolvedCdcRecoveryRoutes,
        revenueOpsStore: resolvedRevenueOpsStore,
        revenueOpsSaasStore: resolvedRevenueOpsSaasStore,
        startupConfig,
        useReadPathSkeleton,
        metrics,
      }))
      .catch((error) => {
        handleRouteError({ request, response, logger: requestContext.logger, metrics, error });
      });
  });
}

function dispatchRequest({
  request,
  response,
  logger,
  changeStore,
  eventStore,
  issueStore,
  runStore,
  traceStore,
  cdcRecoveryRoutes,
  revenueOpsStore,
  revenueOpsSaasStore,
  startupConfig,
  useReadPathSkeleton,
  metrics,
}) {
    if (request.method === "GET" && request.url === "/healthz") {
      return writeJson(response, 200, {
        status: "ok",
      });
    }

    if (request.method === "GET" && request.url === "/readyz") {
      const readiness = getReadiness({ startupConfig });
      return writeJson(response, readiness.ready ? 200 : 503, readiness.body);
    }

    enforceAuthorization({
      request,
      authConfig: startupConfig.authConfig,
    });

    if (useReadPathSkeleton && isReadPathSkeletonRoute(request)) {
      return handleReadPathSkeleton({ request, response });
    }

    if (cdcRecoveryRoutes?.matches(request)) {
      return cdcRecoveryRoutes.handle(request, response);
    }

    if (request.method === "GET" && /^\/api\/v1\/dashboard\/overview(?:\?.*)?$/.test(request.url)) {
      return handleDashboardOverview({
        response,
        runStore,
        traceStore,
        logger,
      });
    }

    if (request.method === "GET" && /^\/api\/v1\/dashboard\/timeline(?:\?.*)?$/.test(request.url)) {
      return handleDashboardTimeline({
        request,
        response,
        changeStore,
        logger,
        metrics,
      });
    }

    if (request.method === "GET" && request.url.startsWith("/api/v1/runs")) {
      if (/^\/api\/v1\/runs\/overview(?:\?.*)?$/.test(request.url)) {
        return handleRunOverview({
          response,
          store: runStore,
          logger,
        });
      }

      if (/^\/api\/v1\/runs\/failures(?:\?.*)?$/.test(request.url)) {
        return handleRunFailures({
          response,
          store: runStore,
          logger,
        });
      }

      const runStateLogMatch = request.url.match(/^\/api\/v1\/runs\/([^/?]+)\/state-log(?:\?.*)?$/);
      if (runStateLogMatch) {
        return handleRunStateLog({
          request,
          response,
          store: runStore,
          logger,
          runId: decodeURIComponent(runStateLogMatch[1]),
        });
      }

      const runDetailMatch = request.url.match(/^\/api\/v1\/runs\/([^/?]+)(?:\?.*)?$/);
      if (runDetailMatch) {
        return handleRunDetail({
          request,
          response,
          store: runStore,
          logger,
          runId: decodeURIComponent(runDetailMatch[1]),
        });
      }

      const isRunList = /^\/api\/v1\/runs(?:\?.*)?$/.test(request.url);
      if (isRunList) {
        return handleRunList({ request, response, store: runStore, logger, metrics });
      }
    }

    const changeTracesMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/changes\/([^/?]+)\/traces(?:\?.*)?$/)
      : null;
    if (changeTracesMatch) {
      return handleChangeTraces({
        request,
        response,
        changeStore,
        traceStore,
        logger,
        metrics,
        changeId: decodeURIComponent(changeTracesMatch[1]),
      });
    }

    const changeDetailMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/changes\/([^/?]+)(?:\?.*)?$/)
      : null;
    if (changeDetailMatch) {
      return handleChangeDetail({
        response,
        store: changeStore,
        logger,
        changeId: decodeURIComponent(changeDetailMatch[1]),
      });
    }

    if (request.method === "GET" && /^\/api\/v1\/changes(?:\?.*)?$/.test(request.url)) {
      return handleChangeList({ request, response, store: changeStore, logger, metrics });
    }

    if (request.method === "POST" && request.url === "/api/v1/changes") {
      return handleChangeIntake({ request, response, store: changeStore, logger, metrics });
    }

    if (request.method === "POST" && request.url === "/api/v1/events/intake") {
      return handleEventIntake({ request, response, store: eventStore, logger, metrics });
    }

    const issueTracesMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/issues\/([^/?]+)\/traces(?:\?.*)?$/)
      : null;
    if (issueTracesMatch) {
      return handleIssueTraces({
        request,
        response,
        issueStore,
        traceStore,
        logger,
        metrics,
        issueId: decodeURIComponent(issueTracesMatch[1]),
      });
    }

    const issueDetailMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/issues\/([^/?]+)(?:\?.*)?$/)
      : null;
    if (issueDetailMatch) {
      return handleIssueDetail({
        response,
        store: issueStore,
        logger,
        issueId: decodeURIComponent(issueDetailMatch[1]),
      });
    }

    if (request.method === "GET" && /^\/api\/v1\/issues(?:\?.*)?$/.test(request.url)) {
      return handleIssueList({ request, response, store: issueStore, logger, metrics });
    }

    if (request.method === "POST" && request.url === "/api/v1/issues/intake") {
      return handleIssueIntake({ request, response, store: issueStore, logger, metrics });
    }

    const issueStatusUpdateMatch = request.method === "PATCH"
      ? request.url.match(/^\/api\/v1\/issues\/([^/?]+)\/status(?:\?.*)?$/)
      : null;
    if (issueStatusUpdateMatch) {
      return handleIssueStatusUpdate({
        request,
        response,
        store: issueStore,
        logger,
        metrics,
        issueId: decodeURIComponent(issueStatusUpdateMatch[1]),
      });
    }

    if (request.method === "POST" && request.url === "/api/v1/reprocess") {
      return handleReprocessRun({ request, response, store: runStore, logger, metrics });
    }

    if (request.method === "GET" && /^\/api\/v1\/traces(?:\?.*)?$/.test(request.url)) {
      return handleTraceList({ request, response, store: traceStore, logger, metrics });
    }

    const traceEvidencesMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/traces\/([^/?]+)\/evidences(?:\?.*)?$/)
      : null;
    if (traceEvidencesMatch) {
      return handleTraceEvidences({
        response,
        store: traceStore,
        logger,
        traceId: decodeURIComponent(traceEvidencesMatch[1]),
      });
    }

    const tracePrimaryIssueMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/traces\/([^/?]+)\/primary-issue(?:\?.*)?$/)
      : null;
    if (tracePrimaryIssueMatch) {
      return handleTracePrimaryIssue({
        response,
        traceStore,
        issueStore,
        logger,
        traceId: decodeURIComponent(tracePrimaryIssueMatch[1]),
      });
    }

    const traceDetailMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/traces\/([^/?]+)(?:\?.*)?$/)
      : null;
    if (traceDetailMatch) {
      return handleTraceDetail({
        response,
        store: traceStore,
        logger,
        traceId: decodeURIComponent(traceDetailMatch[1]),
      });
    }

    if (request.method === "POST" && request.url === "/api/v1/traces") {
      return handleTraceCreate({ request, response, store: traceStore, logger, metrics });
    }

    const retryMatch = request.method === "POST"
      ? request.url.match(/^\/api\/v1\/runs\/([^/]+)\/retry$/)
      : null;
    if (retryMatch) {
      return handleRetryRun({
        request,
        response,
        store: runStore,
        logger,
        metrics,
        runId: decodeURIComponent(retryMatch[1]),
      });
    }

    if (request.method === "OPTIONS" && (request.url.startsWith("/api/v1/revenue") || request.url.startsWith("/api/v1/stores") || request.url.startsWith("/api/v1/me"))) {
      response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "authorization,content-type" });
      return response.end();
    }

    if (request.method === "GET" && /^\/api\/v1\/me(?:\?.*)?$/.test(request.url)) {
      return handleGetMe({ request, response, store: revenueOpsSaasStore });
    }

    if (request.method === "GET" && /^\/api\/v1\/stores(?:\?.*)?$/.test(request.url)) {
      return handleListStores({ request, response, store: revenueOpsSaasStore });
    }

    if (request.method === "POST" && /^\/api\/v1\/stores(?:\?.*)?$/.test(request.url)) {
      return handleCreateStore({ request, response, store: revenueOpsSaasStore });
    }

    const storeRootMatch = request.url.match(/^\/api\/v1\/stores\/([^/?]+)(?:\?.*)?$/);
    if (storeRootMatch) {
      const storeId = decodeURIComponent(storeRootMatch[1]);
      if (request.method === "PATCH") {
        return handleUpdateStore({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "DELETE") {
        return handleArchiveStore({ request, response, store: revenueOpsSaasStore, storeId });
      }
    }

    const storeScopedMatch = request.url.match(/^\/api\/v1\/stores\/([^/?]+)\/(.+?)(?:\?.*)?$/);
    if (storeScopedMatch) {
      const storeId = decodeURIComponent(storeScopedMatch[1]);
      const rest = storeScopedMatch[2];

      if (request.method === "GET" && rest === "briefs") {
        return handleGetStoreBriefs({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "GET" && rest === "anomalies") {
        return handleGetStoreAnomalies({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "GET" && rest === "actions") {
        return handleGetStoreActions({ request, response, store: revenueOpsSaasStore, storeId });
      }
      const storeActionStatusMatch = request.method === "PATCH" ? rest.match(/^actions\/([^/?]+)\/status$/) : null;
      if (storeActionStatusMatch) {
        return handleUpdateStoreActionStatus({
          request,
          response,
          store: revenueOpsSaasStore,
          storeId,
          actionId: decodeURIComponent(storeActionStatusMatch[1]),
        });
      }
      if (request.method === "GET" && rest === "context") {
        return handleGetStoreContext({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "POST" && rest === "context/collect") {
        return handleCollectStoreContext({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "GET" && rest === "pipeline-meta") {
        return handleGetStorePipelineMeta({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "GET" && rest === "revenue/uploads") {
        return handleListRevenueUploads({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "POST" && rest === "revenue/uploads/preview") {
        return handlePreviewRevenueUpload({ request, response, store: revenueOpsSaasStore, storeId });
      }
      if (request.method === "POST" && rest === "revenue/uploads") {
        return handleCreateRevenueUpload({ request, response, store: revenueOpsSaasStore, storeId });
      }
      const rejectedRowsMatch = request.method === "GET" ? rest.match(/^revenue\/uploads\/([^/?]+)\/rejected-rows$/) : null;
      if (rejectedRowsMatch) {
        return handleListRejectedRevenueRows({
          request,
          response,
          store: revenueOpsSaasStore,
          storeId,
          uploadId: decodeURIComponent(rejectedRowsMatch[1]),
        });
      }
      const reprocessMatch = request.method === "POST" ? rest.match(/^revenue\/uploads\/([^/?]+)\/reprocess$/) : null;
      if (reprocessMatch) {
        return handleReprocessRevenueUpload({
          request,
          response,
          store: revenueOpsSaasStore,
          storeId,
          uploadId: decodeURIComponent(reprocessMatch[1]),
        });
      }
      if (request.method === "GET" && rest === "cause-candidates") {
        return handleGetStoreCauseCandidates({ request, response, store: revenueOpsSaasStore, storeId });
      }
      const causeCandidateMatch = request.method === "GET" ? rest.match(/^cause-candidates\/([^/?]+)$/) : null;
      if (causeCandidateMatch) {
        return handleGetStoreCauseCandidate({
          request,
          response,
          store: revenueOpsSaasStore,
          storeId,
          causeCandidateId: decodeURIComponent(causeCandidateMatch[1]),
        });
      }
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/health\/aurora(?:\?.*)?$/.test(request.url)) {
      return handleGetAuroraHealth({ response });
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/briefs(?:\?.*)?$/.test(request.url)) {
      return handleGetBriefs({ response, store: revenueOpsStore });
    }

    const revBriefMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/revenue\/briefs\/([^/?]+)(?:\?.*)?$/)
      : null;
    if (revBriefMatch) {
      return handleGetBriefById({ response, store: revenueOpsStore, briefId: decodeURIComponent(revBriefMatch[1]) });
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/anomalies(?:\?.*)?$/.test(request.url)) {
      return handleGetAnomalies({ response, store: revenueOpsStore });
    }

    const revEvidenceMatch = request.method === "GET"
      ? request.url.match(/^\/api\/v1\/revenue\/anomalies\/([^/?]+)\/evidence(?:\?.*)?$/)
      : null;
    if (revEvidenceMatch) {
      return handleGetEvidenceForAnomaly({ response, store: revenueOpsStore, anomalyId: decodeURIComponent(revEvidenceMatch[1]) });
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/actions(?:\?.*)?$/.test(request.url)) {
      return handleGetActions({ response, store: revenueOpsStore });
    }

    const revActionStatusMatch = request.method === "PATCH"
      ? request.url.match(/^\/api\/v1\/revenue\/actions\/([^/?]+)\/status(?:\?.*)?$/)
      : null;
    if (revActionStatusMatch) {
      return handleUpdateActionStatus({ request, response, store: revenueOpsStore, actionId: decodeURIComponent(revActionStatusMatch[1]) });
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/context(?:\?.*)?$/.test(request.url)) {
      return handleGetContext({ response, store: revenueOpsStore });
    }

    if (request.method === "GET" && /^\/api\/v1\/revenue\/pipeline-meta(?:\?.*)?$/.test(request.url)) {
      return handleGetPipelineMeta({ response, store: revenueOpsStore });
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        error: {
          code: "not_found",
          message: "route not found",
        },
      }),
    );
  return undefined;
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const logger = createLogger();
  const metrics = createNoopMetricsEmitter();
  const server = createServer({ logger, metrics, readPathSkeleton: true });
  registerGracefulShutdown({
    server,
    logger,
    metrics,
  });

  server.listen(port, () => {
    process.stdout.write(`${JSON.stringify({ level: "info", event: "api_server_started", port })}\n`);
  });
}

function getReadiness({ startupConfig }) {
  if (startupConfig.auroraBackends.length > 0 && !startupConfig.hasDatabaseUrl) {
    return {
      ready: false,
      body: {
        status: "not_ready",
      },
    };
  }

  return {
    ready: true,
    body: {
      status: "ready",
    },
  };
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

module.exports = {
  createServer,
  getReadiness,
};
