/**
 * HTTP handlers for Revenue Ops cockpit endpoints.
 *
 * Routes:
 *   GET  /api/v1/revenue/briefs
 *   GET  /api/v1/revenue/briefs/:id
 *   GET  /api/v1/revenue/anomalies
 *   GET  /api/v1/revenue/anomalies/:id/evidence
 *   GET  /api/v1/revenue/actions
 *   PATCH /api/v1/revenue/actions/:id/status
 *   GET  /api/v1/revenue/context
 *   GET  /api/v1/revenue/pipeline-meta
 */
const { RevenueOpsHttpError, requireClaimsFromRequest } = require("./revenue-ops-auth");

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

function writeError(response, status, code, message) {
  return writeJson(response, status, { error: { code, message } });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new RevenueOpsHttpError(400, "bad_request", "Invalid JSON body");
  }
}

async function resolveAppUser({ request, store }) {
  const claims = requireClaimsFromRequest(request);
  return store.resolveAppUserFromJwtClaims(claims);
}

async function ensureStoreAccess({ response, store, appUser, storeId, minimumRole = "viewer" }) {
  const access = await store.requireStoreAccess(appUser.app_user_id, storeId, minimumRole);
  if (!access) {
    writeError(response, 403, "forbidden", "Store access is required");
    return null;
  }
  return access;
}

async function handleStoreRouteError(response, error) {
  if (error instanceof RevenueOpsHttpError) {
    return writeError(response, error.statusCode, error.code, error.message);
  }

  if (error?.code === "invalid_body" || error?.code === "invalid_status") {
    return writeError(response, 400, "bad_request", error.message);
  }

  return writeError(response, 500, "internal_error", "Internal server error");
}

function handleGetBriefs({ response, store }) {
  return writeJson(response, 200, { briefs: store.getBriefs() });
}

function handleGetBriefById({ response, store, briefId }) {
  const brief = store.getBriefById(briefId);
  if (!brief) {
    return writeJson(response, 404, { error: { code: "not_found", message: "Brief not found" } });
  }
  return writeJson(response, 200, { brief });
}

function handleGetAnomalies({ response, store }) {
  return writeJson(response, 200, { anomalies: store.getAnomalies() });
}

function handleGetEvidenceForAnomaly({ response, store, anomalyId }) {
  return writeJson(response, 200, { evidence: store.getEvidenceForAnomaly(anomalyId) });
}

async function handleGetActions({ response, store }) {
  const actions = await store.getActions();
  return writeJson(response, 200, { actions });
}

async function handleUpdateActionStatus({ request, response, store, actionId }) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return writeJson(response, 400, { error: { code: "bad_request", message: "Invalid JSON body" } });
  }

  const { status } = body;
  if (!status) {
    return writeJson(response, 400, { error: { code: "bad_request", message: "Missing 'status' field" } });
  }

  let updated;
  try {
    updated = await store.updateActionStatus(actionId, status);
  } catch (err) {
    return writeJson(response, 400, { error: { code: "bad_request", message: err.message } });
  }

  if (!updated) {
    return writeJson(response, 404, { error: { code: "not_found", message: "Action not found" } });
  }

  return writeJson(response, 200, {
    action: updated.action ?? updated,
    ...(updated.status_persistence ? { status_persistence: updated.status_persistence } : {}),
  });
}

function handleGetContext({ response, store }) {
  return writeJson(response, 200, { context: store.getContext() });
}

function handleGetPipelineMeta({ response, store }) {
  return writeJson(response, 200, { pipeline_meta: store.getPipelineMeta() });
}

async function handleGetMe({ request, response, store }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    return writeJson(response, 200, { app_user: appUser });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleListStores({ request, response, store }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    return writeJson(response, 200, {
      app_user: appUser,
      stores: await store.listStoresForUser(appUser.app_user_id),
    });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleCreateStore({ request, response, store }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    const body = await readJsonBody(request);
    const created = await store.createStoreForUser(appUser.app_user_id, body);
    return writeJson(response, 201, { store: created });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreBriefs({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { briefs: await store.getBriefsForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreAnomalies({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { anomalies: await store.getAnomaliesForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreActions({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { actions: await store.getActionsForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleUpdateStoreActionStatus({ request, response, store, storeId, actionId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    const body = await readJsonBody(request);
    const status = body.status;
    if (!status) {
      return writeError(response, 400, "bad_request", "Missing 'status' field");
    }

    const action = await store.updateActionStatusForStore({
      appUserId: appUser.app_user_id,
      storeId,
      actionId,
      status,
      planned_start_date: body.planned_start_date,
      planned_end_date: body.planned_end_date,
    });
    if (!action) {
      return writeError(response, 404, "not_found", "Action not found");
    }
    return writeJson(response, 200, { action, status_persistence: "store_scoped" });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreContext({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { context: await store.getContextForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStorePipelineMeta({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { pipeline_meta: await store.getPipelineMetaForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleListRevenueUploads({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { uploads: await store.listRevenueUploadsForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleCreateRevenueUpload({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId, minimumRole: "operator" })) return undefined;
    const body = await readJsonBody(request);
    const result = await store.ingestRevenueUpload({ appUserId: appUser.app_user_id, storeId, payload: body });
    return writeJson(response, 201, result);
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handlePreviewRevenueUpload({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId, minimumRole: "operator" })) return undefined;
    const body = await readJsonBody(request);
    const preview = await store.previewRevenueUpload(body);
    return writeJson(response, 200, { preview });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleListRejectedRevenueRows({ request, response, store, storeId, uploadId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId, minimumRole: "operator" })) return undefined;
    const rejectedRows = await store.listRejectedRowsForUpload(storeId, uploadId);
    if (!rejectedRows) {
      return writeError(response, 404, "not_found", "Revenue upload not found");
    }
    return writeJson(response, 200, { rejected_rows: rejectedRows });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleReprocessRevenueUpload({ request, response, store, storeId, uploadId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId, minimumRole: "operator" })) return undefined;
    const result = await store.reprocessRevenueUpload(storeId, uploadId);
    if (!result) {
      return writeError(response, 404, "not_found", "Revenue upload not found");
    }
    return writeJson(response, 202, result);
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleCollectStoreContext({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId, minimumRole: "operator" })) return undefined;
    const body = await readJsonBody(request);
    const result = await store.collectContextForStore(storeId, body);
    return writeJson(response, 202, result);
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreCauseCandidates({ request, response, store, storeId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    return writeJson(response, 200, { cause_candidates: await store.getCauseCandidatesForStore(storeId) });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

async function handleGetStoreCauseCandidate({ request, response, store, storeId, causeCandidateId }) {
  try {
    const appUser = await resolveAppUser({ request, store });
    if (!await ensureStoreAccess({ response, store, appUser, storeId })) return undefined;
    const causeCandidate = await store.getCauseCandidateForStore(storeId, causeCandidateId);
    if (!causeCandidate) {
      return writeError(response, 404, "not_found", "Cause candidate not found");
    }
    return writeJson(response, 200, { cause_candidate: causeCandidate });
  } catch (error) {
    return handleStoreRouteError(response, error);
  }
}

module.exports = {
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
};
