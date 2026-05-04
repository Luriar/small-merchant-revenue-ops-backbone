const { forbiddenError, mapCdcRecoveryError, unauthorizedError } = require("./cdc-recovery-errors");

const ROUTE_METHODS = Object.freeze({
  listFailures: "listFailures",
  getFailureDetail: "getFailureDetail",
  listFailureStateLog: "listFailureStateLog",
  listReplayRequests: "listReplayRequests",
  getReplayRequestDetail: "getReplayRequestDetail",
  createReplayRequest: "createReplayRequest",
  approveReplayRequest: "approveReplayRequest",
  cancelReplayRequest: "cancelReplayRequest",
});

function createCdcRecoveryHandler({ service, authorize } = {}) {
  if (!service) {
    throw new Error("cdc recovery service is required");
  }

  const requireRole = authorize ?? defaultAuthorize;

  return {
    ROUTE_METHODS,
    async listFailures(context = {}) {
      requireRole(context, ["readonly_role", "operator", "maintainer"]);
      return service.listFailures(context.filter, context.page);
    },
    async getFailureDetail(context = {}) {
      requireRole(context, ["readonly_role", "operator", "maintainer"]);
      return service.getFailureDetail(context.failureId);
    },
    async listFailureStateLog(context = {}) {
      requireRole(context, ["readonly_role", "operator", "maintainer"]);
      return service.listFailureStateLog(context.failureId, context.page);
    },
    async listReplayRequests(context = {}) {
      requireRole(context, ["readonly_role", "operator", "maintainer"]);
      return service.listReplayRequests(context.filter, context.page);
    },
    async getReplayRequestDetail(context = {}) {
      requireRole(context, ["readonly_role", "operator", "maintainer"]);
      return service.getReplayRequestDetail(context.replayRequestId);
    },
    async createReplayRequest(context = {}) {
      requireRole(context, ["operator", "maintainer"]);
      return service.createReplayRequest(
        context.failureId,
        context.input,
        context.operatorIdentity,
      );
    },
    async approveReplayRequest(context = {}) {
      requireRole(context, ["maintainer"]);
      return service.approveReplayRequest(
        context.replayRequestId,
        context.input,
        context.operatorIdentity,
      );
    },
    async cancelReplayRequest(context = {}) {
      requireRole(context, ["maintainer"]);
      return service.cancelReplayRequest(
        context.replayRequestId,
        context.input,
        context.operatorIdentity,
      );
    },
    mapError: mapCdcRecoveryError,
  };
}

function defaultAuthorize(context, allowedRoles) {
  if (!context.authenticated) {
    throw unauthorizedError();
  }

  if (!allowedRoles.includes(context.role)) {
    throw forbiddenError();
  }
}

module.exports = {
  ROUTE_METHODS,
  createCdcRecoveryHandler,
  defaultAuthorize,
};
