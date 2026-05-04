const { createCdcRecoveryHandler } = require("../cdc-recovery-handler");
const { notFoundError, validationError } = require("../cdc-recovery-errors");
const {
  enforceIdempotency,
  enforceStateTransition,
  validateCreateReplayRequest,
} = require("../cdc-recovery-service");
const {
  toSafeFailureDto,
  toSafeListDto,
  toSafeReplayRequestDto,
  toSafeStateLogDto,
} = require("../cdc-recovery-dto-mapper");
const { authorizeTestRole } = require("./cdc-recovery-test-auth");
const { adaptCdcRecoveryTestError } = require("./cdc-recovery-test-error-adapter");
const { createCdcRecoveryStubRepository } = require("./cdc-recovery-stub-repository");

function createCdcRecoveryTestHarness({ repository = createCdcRecoveryStubRepository() } = {}) {
  const service = createTestRouteService({ repository });
  const handler = createCdcRecoveryHandler({
    service,
    authorize: authorizeTestRole,
  });

  async function dispatchTestRoute({ method, path, role, routeParams = {}, input = null } = {}) {
    const match = matchRoute({ method, path });
    if (!match) {
      return {
        statusCode: 404,
        value: {
          error: {
            code: "not_found",
            message: "not found",
            status: 404,
          },
        },
      };
    }

    const context = {
      authenticated: typeof role === "string" && role.length > 0,
      role,
      ...routeParams,
      ...match.routeParams,
      input,
      operatorIdentity: typeof role === "string" ? `${role}_test_ref` : null,
    };

    try {
      const result = await handler[match.handlerMethod](context);
      return normalizeSuccessResult(result, match.successStatus);
    } catch (error) {
      return adaptCdcRecoveryTestError(error);
    }
  }

  return {
    dispatchTestRoute,
    repository,
  };
}

function createTestRouteService({ repository }) {
  return {
    async listFailures(filter, page) {
      const records = await repository.listFailures(filter, page);
      return toSafeListDto(records, toSafeFailureDto);
    },
    async getFailureDetail(failureId) {
      const record = await repository.getFailureById(failureId);
      if (!record) {
        throw notFoundError("not found");
      }
      return toSafeFailureDto(record);
    },
    async listFailureStateLog(failureId, page) {
      const record = await repository.getFailureById(failureId);
      if (!record) {
        throw notFoundError("not found");
      }
      const records = await repository.listFailureStateLog(failureId, page);
      return toSafeListDto(records, toSafeStateLogDto);
    },
    async listReplayRequests(filter, page) {
      const records = await repository.listReplayRequests(filter, page);
      return toSafeListDto(records, toSafeReplayRequestDto);
    },
    async getReplayRequestDetail(replayRequestId) {
      const record = await repository.getReplayRequestById(replayRequestId);
      if (!record) {
        throw notFoundError("not found");
      }
      return toSafeReplayRequestDto(record);
    },
    async createReplayRequest(failureId, input) {
      const validation = validateCreateReplayRequest(input);
      if (!validation.ok) {
        return {
          ok: false,
          error: validationError("validation failed", input?.evidence_report_ref),
        };
      }

      const failure = await repository.getFailureById(failureId);
      if (!failure) {
        throw notFoundError("not found");
      }

      const existingRequest = await repository.findReplayRequestByIdempotencyKey(
        validation.value.idempotency_key,
      );
      const idempotency = enforceIdempotency({
        existingRequest,
        input: validation.value,
      });

      if (idempotency.kind !== "create") {
        return idempotency;
      }

      const created = await repository.createReplayRequest({
        ...validation.value,
        failure_id: failureId,
      });
      await repository.updateFailureStatus(failureId, {
        to_status: "replay_requested",
        replay_request_id: created.replay_request_id,
      });
      await repository.appendFailureStateLog({
        failure_id: failureId,
        replay_request_id: created.replay_request_id,
        from_status: failure.status,
        to_status: "replay_requested",
        reason_code: "safe_replay_requested",
        owner: created.owner,
        safe_metadata: {
          action_label: "create_replay_request",
        },
        evidence_report_ref: created.evidence_report_ref,
      });

      return {
        kind: "created",
        statusCode: 201,
        value: toSafeReplayRequestDto(created),
      };
    },
    async approveReplayRequest(replayRequestId, input) {
      return applyReplayRequestTransition({
        repository,
        replayRequestId,
        input,
        action: "approve",
        failureStatus: "replay_approved",
        reasonCode: "safe_replay_approved",
      });
    },
    async cancelReplayRequest(replayRequestId, input) {
      return applyReplayRequestTransition({
        repository,
        replayRequestId,
        input,
        action: "cancel",
        failureStatus: "triaged",
        reasonCode: "safe_replay_cancelled",
      });
    },
  };
}

async function applyReplayRequestTransition({
  repository,
  replayRequestId,
  input,
  action,
  failureStatus,
  reasonCode,
}) {
  const existing = await repository.getReplayRequestById(replayRequestId);
  if (!existing) {
    throw notFoundError("not found");
  }

  const transition = enforceStateTransition(existing.status, action);
  if (!transition.ok) {
    return {
      ok: false,
      error: transition.error,
    };
  }

  const updated = await repository.updateReplayRequestStatus(replayRequestId, {
    to_status: transition.to_status,
  });
  await repository.updateFailureStatus(existing.failure_id, {
    to_status: failureStatus,
    replay_request_id: replayRequestId,
  });
  await repository.appendFailureStateLog({
    failure_id: existing.failure_id,
    replay_request_id: replayRequestId,
    from_status: existing.status,
    to_status: transition.to_status,
    reason_code: reasonCode,
    owner: existing.owner,
    safe_metadata: {
      action_label: action,
    },
    evidence_report_ref: input?.evidence_report_ref ?? existing.evidence_report_ref,
  });

  return {
    ok: true,
    statusCode: 200,
    value: toSafeReplayRequestDto(updated),
  };
}

function matchRoute({ method, path }) {
  if (method === "GET" && /^\/api\/v1\/cdc\/failures(?:\?.*)?$/.test(path)) {
    return { handlerMethod: "listFailures", successStatus: 200, routeParams: {} };
  }

  const failureStateLogMatch = method === "GET"
    ? path.match(/^\/api\/v1\/cdc\/failures\/([^/?]+)\/state-log(?:\?.*)?$/)
    : null;
  if (failureStateLogMatch) {
    return {
      handlerMethod: "listFailureStateLog",
      successStatus: 200,
      routeParams: { failureId: decodeURIComponent(failureStateLogMatch[1]) },
    };
  }

  const createReplayMatch = method === "POST"
    ? path.match(/^\/api\/v1\/cdc\/failures\/([^/?]+)\/replay-requests(?:\?.*)?$/)
    : null;
  if (createReplayMatch) {
    return {
      handlerMethod: "createReplayRequest",
      successStatus: 201,
      routeParams: { failureId: decodeURIComponent(createReplayMatch[1]) },
    };
  }

  const failureDetailMatch = method === "GET"
    ? path.match(/^\/api\/v1\/cdc\/failures\/([^/?]+)(?:\?.*)?$/)
    : null;
  if (failureDetailMatch) {
    return {
      handlerMethod: "getFailureDetail",
      successStatus: 200,
      routeParams: { failureId: decodeURIComponent(failureDetailMatch[1]) },
    };
  }

  if (method === "GET" && /^\/api\/v1\/cdc\/replay-requests(?:\?.*)?$/.test(path)) {
    return { handlerMethod: "listReplayRequests", successStatus: 200, routeParams: {} };
  }

  const approveMatch = method === "POST"
    ? path.match(/^\/api\/v1\/cdc\/replay-requests\/([^/?]+)\/approve(?:\?.*)?$/)
    : null;
  if (approveMatch) {
    return {
      handlerMethod: "approveReplayRequest",
      successStatus: 200,
      routeParams: { replayRequestId: decodeURIComponent(approveMatch[1]) },
    };
  }

  const cancelMatch = method === "POST"
    ? path.match(/^\/api\/v1\/cdc\/replay-requests\/([^/?]+)\/cancel(?:\?.*)?$/)
    : null;
  if (cancelMatch) {
    return {
      handlerMethod: "cancelReplayRequest",
      successStatus: 200,
      routeParams: { replayRequestId: decodeURIComponent(cancelMatch[1]) },
    };
  }

  const replayRequestDetailMatch = method === "GET"
    ? path.match(/^\/api\/v1\/cdc\/replay-requests\/([^/?]+)(?:\?.*)?$/)
    : null;
  if (replayRequestDetailMatch) {
    return {
      handlerMethod: "getReplayRequestDetail",
      successStatus: 200,
      routeParams: { replayRequestId: decodeURIComponent(replayRequestDetailMatch[1]) },
    };
  }

  return null;
}

function normalizeSuccessResult(result, fallbackStatus) {
  if (result?.ok === false && result.error) {
    return adaptCdcRecoveryTestError(result.error);
  }

  if (result?.kind === "conflict" && result.error) {
    return adaptCdcRecoveryTestError(result.error);
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

module.exports = {
  createCdcRecoveryTestHarness,
  createTestRouteService,
  matchRoute,
};
