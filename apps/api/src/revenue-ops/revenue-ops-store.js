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


function normalizeActionText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function actionDedupKey(action) {
  return [
    normalizeActionText(action.title),
    normalizeActionText(action.action_type),
    normalizeActionText(action.description || action.why_this_action),
  ].join("::");
}

function actionFamilyIds(actions, actionId) {
  const action = actions.find((item) => item.action_id === actionId);
  if (!action) {
    return [];
  }

  const key = actionDedupKey(action);
  return actions
    .filter((item) => actionDedupKey(item) === key)
    .map((item) => item.action_id);
}

function chooseMergedStatus(statuses) {
  const rank = {
    recommended: 0,
    dismissed: 1,
    selected: 2,
    planned: 3,
    done: 4,
  };

  return statuses
    .filter((status) => VALID_ACTION_STATUSES.includes(status))
    .sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))[0] ?? "recommended";
}

function dedupeActions(actions, statusMap) {
  const grouped = new Map();

  for (const action of actions) {
    const key = actionDedupKey(action);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(action);
  }

  return Array.from(grouped.values()).map((group) => {
    const representative = group[0];
    const statuses = group.map((action) => statusMap.get(action.action_id) ?? action.status ?? "recommended");
    const mergedStatus = chooseMergedStatus(statuses);

    return {
      ...representative,
      status: mergedStatus,
      action_family_ids: group.map((action) => action.action_id),
      duplicate_count: group.length,
    };
  });
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
    return dedupeActions(exported.actions.filter(filterFn), mergedStatusMap);
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
      const familyIds = actionFamilyIds(exported.actions, actionId);
      let statusPersistence = "memory";

      if (actionStatusPersistence && typeof actionStatusPersistence.upsertActionStatus === "function") {
        try {
          await Promise.all(familyIds.map((familyActionId) => actionStatusPersistence.upsertActionStatus(familyActionId, newStatus)));
          statusPersistence = "aurora";
        } catch {
          statusPersistence = "memory_fallback";
        }
      }

      for (const familyActionId of familyIds) {
        actionStatusMap.set(familyActionId, newStatus);
      }

      return {
        action: {
          ...action,
          status: newStatus,
          action_family_ids: familyIds,
          duplicate_count: familyIds.length,
        },
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
