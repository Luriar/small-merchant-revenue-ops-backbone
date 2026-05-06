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

function writeJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
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

module.exports = {
  handleGetBriefs,
  handleGetBriefById,
  handleGetAnomalies,
  handleGetEvidenceForAnomaly,
  handleGetActions,
  handleUpdateActionStatus,
  handleGetContext,
  handleGetPipelineMeta,
};
