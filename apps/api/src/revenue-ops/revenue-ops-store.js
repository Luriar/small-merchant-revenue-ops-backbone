/**
 * Revenue Ops store: loads Gold export JSON on startup and overlays
 * runtime action-status overrides from Aurora when available.
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

function sanitizeGoldFilePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return "";
  }
  const normalized = filePath.split(path.sep).join("/");
  const marker = "/data/gold/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + 1);
  }
  return path.basename(filePath);
}

function sanitizePipelineMeta(pipelineMeta = {}) {
  const goldFiles = pipelineMeta.gold_files && typeof pipelineMeta.gold_files === "object"
    ? Object.fromEntries(
      Object.entries(pipelineMeta.gold_files).map(([key, value]) => [key, sanitizeGoldFilePath(value)])
    )
    : {};

  return {
    ...pipelineMeta,
    gold_files: goldFiles,
  };
}

function createRevenueOpsStore({ actionStatusPersistence = null } = {}) {
  const exported = loadExport();
  const pipelineMeta = sanitizePipelineMeta(exported.pipeline_meta);

  const actionStatusMap = new Map(
    exported.actions.map((a) => [a.action_id, a.status || "recommended"])
  );

  async function loadMergedActionStatusMap() {
    const merged = new Map(actionStatusMap);

    if (!actionStatusPersistence || typeof actionStatusPersistence.listActionStatusOverrides !== "function") {
      return merged;
    }

    try {
      const overrides = await actionStatusPersistence.listActionStatusOverrides();
      for (const override of overrides) {
        if (VALID_ACTION_STATUSES.includes(override.status)) {
          merged.set(override.action_id, override.status);
          actionStatusMap.set(override.action_id, override.status);
        }
      }
    } catch {
      // Runtime fallback: keep demo/export-backed in-memory behavior if Aurora is temporarily unavailable.
    }

    return merged;
  }

  async function buildActions(filterFn = () => true) {
    const mergedStatusMap = await loadMergedActionStatusMap();
    return exported.actions
      .filter(filterFn)
      .map((a) => ({
        ...a,
        status: mergedStatusMap.get(a.action_id) ?? "recommended",
      }));
  }

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

    async getActions() {
      return buildActions();
    },

    async getActionsForAnomaly(anomalyId) {
      return buildActions((a) => a.anomaly_id === anomalyId);
    },

    async updateActionStatus(actionId, newStatus) {
      if (!VALID_ACTION_STATUSES.includes(newStatus)) {
        throw new Error(`Invalid status '${newStatus}'. Valid: ${VALID_ACTION_STATUSES.join(", ")}`);
      }
      if (!actionStatusMap.has(actionId)) {
        return null;
      }

      const action = exported.actions.find((a) => a.action_id === actionId);
      let statusPersistence = "memory";

      if (actionStatusPersistence && typeof actionStatusPersistence.upsertActionStatus === "function") {
        try {
          await actionStatusPersistence.upsertActionStatus(actionId, newStatus);
          statusPersistence = "aurora";
        } catch {
          statusPersistence = "memory_fallback";
        }
      }

      actionStatusMap.set(actionId, newStatus);

      return {
        action: { ...action, status: newStatus },
        status_persistence: statusPersistence,
      };
    },

    getContext() {
      return exported.context;
    },

    getPipelineMeta() {
      return pipelineMeta;
    },
  };
}

module.exports = { createRevenueOpsStore, VALID_ACTION_STATUSES };
