/**
 * Revenue Ops in-memory store: loads Gold export JSON on startup,
 * provides action status mutation with optional Aurora persistence.
 */
const fs = require("node:fs");
const path = require("node:path");

const DATA_PATH = path.join(__dirname, "data", "revenue_ops_export.json");

const VALID_ACTION_STATUSES = ["recommended", "selected", "planned", "done", "dismissed"];

function loadExport() {
  if (!fs.existsSync(DATA_PATH)) {
    return { briefs: [], anomalies: [], evidence: [], actions: [], context: [], pipeline_meta: {} };
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function createRevenueOpsStore() {
  const exported = loadExport();

  const actionStatusMap = new Map(
    exported.actions.map((a) => [a.action_id, a.status || "recommended"])
  );

  return {
    getBriefs() {
      return exported.briefs;
    },

    getBriefById(briefId) {
      return exported.briefs.find((b) => b.brief_id === briefId) ?? null;
    },

    getAnomalies() {
      return exported.anomalies;
    },

    getEvidenceForAnomaly(anomalyId) {
      return exported.evidence.filter((e) => e.anomaly_id === anomalyId);
    },

    getActions() {
      return exported.actions.map((a) => ({
        ...a,
        status: actionStatusMap.get(a.action_id) ?? "recommended",
      }));
    },

    getActionsForAnomaly(anomalyId) {
      return exported.actions
        .filter((a) => a.anomaly_id === anomalyId)
        .map((a) => ({
          ...a,
          status: actionStatusMap.get(a.action_id) ?? "recommended",
        }));
    },

    updateActionStatus(actionId, newStatus) {
      if (!VALID_ACTION_STATUSES.includes(newStatus)) {
        throw new Error(`Invalid status '${newStatus}'. Valid: ${VALID_ACTION_STATUSES.join(", ")}`);
      }
      if (!actionStatusMap.has(actionId)) {
        return null;
      }
      actionStatusMap.set(actionId, newStatus);
      const action = exported.actions.find((a) => a.action_id === actionId);
      return { ...action, status: newStatus };
    },

    getContext() {
      return exported.context;
    },

    getPipelineMeta() {
      return exported.pipeline_meta;
    },
  };
}

module.exports = { createRevenueOpsStore, VALID_ACTION_STATUSES };
