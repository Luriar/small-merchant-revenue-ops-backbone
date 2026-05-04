const { conflictError, validationError } = require("./cdc-recovery-errors");
const {
  containsForbiddenKeys,
  toSafeFailureDto,
  toSafeReplayRequestDto,
} = require("./cdc-recovery-dto-mapper");

const CREATE_REPLAY_REQUIRED_FIELDS = Object.freeze([
  "idempotency_key",
  "requested_action",
  "bounded_scope",
  "evidence_report_ref",
]);

const CREATE_REPLAY_ALLOWED_FIELDS = Object.freeze([
  "idempotency_key",
  "requested_action",
  "bounded_scope",
  "target_topic",
  "target_table",
  "attempt_count",
  "owner",
  "requester_ref",
  "reason_summary",
  "source_run_id",
  "evidence_report_ref",
]);

const REQUESTED_ACTIONS = Object.freeze(["retry", "replay", "reprocess"]);

const ACTIVE_REPLAY_REQUEST_STATUSES = Object.freeze([
  "requested",
  "approved",
  "running",
]);

const STATE_TRANSITIONS = Object.freeze({
  approve: {
    requested: "approved",
  },
  cancel: {
    requested: "cancelled",
    approved: "cancelled",
  },
  mark_running: {
    approved: "running",
  },
  mark_succeeded: {
    running: "succeeded",
  },
  mark_failed: {
    running: "failed",
  },
  mark_cleanup_complete: {
    succeeded: "cleanup_complete",
  },
});

function createCdcRecoveryService({ repository } = {}) {
  return {
    validateCreateReplayRequest,
    enforceIdempotency,
    enforceStateTransition,
    buildSafeFailureDto: toSafeFailureDto,
    buildSafeReplayRequestDto: toSafeReplayRequestDto,
    async createReplayRequest(failureId, input, operatorIdentity) {
      const validation = validateCreateReplayRequest(input);
      if (!validation.ok) {
        return {
          ok: false,
          error: validationError("validation failed", input?.evidence_report_ref),
          errors: validation.errors,
        };
      }

      if (!repository) {
        return {
          ok: true,
          decision: "validated_only",
          failure_id: failureId,
          operator_ref: normalizeIdentity(operatorIdentity),
          value: validation.value,
        };
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

      throw new Error("cdc recovery persistence is not implemented");
    },
    async approveReplayRequest(replayRequestId, input, operatorIdentity) {
      return buildTransitionDecision({
        replayRequestId,
        input,
        operatorIdentity,
        action: "approve",
      });
    },
    async cancelReplayRequest(replayRequestId, input, operatorIdentity) {
      return buildTransitionDecision({
        replayRequestId,
        input,
        operatorIdentity,
        action: "cancel",
      });
    },
  };
}

function validateCreateReplayRequest(input) {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ["input must be a JSON object"],
    };
  }

  const errors = [];
  for (const field of Object.keys(input)) {
    if (!CREATE_REPLAY_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of CREATE_REPLAY_REQUIRED_FIELDS) {
    if (field === "bounded_scope") {
      if (!isPlainObject(input[field])) {
        errors.push("bounded_scope is required");
      }
      continue;
    }
    if (!hasNonEmptyString(input[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (hasNonEmptyString(input.requested_action) && !REQUESTED_ACTIONS.includes(input.requested_action)) {
    errors.push("requested_action is invalid");
  }

  if (typeof input.attempt_count !== "undefined" && !isNonNegativeInteger(input.attempt_count)) {
    errors.push("attempt_count must be a non-negative integer");
  }

  if (containsForbiddenKeys(input)) {
    errors.push("forbidden field leakage detected");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: normalizeCreateReplayRequest(input),
  };
}

function enforceIdempotency({ existingRequest, input }) {
  if (!existingRequest) {
    return { kind: "create" };
  }

  const existingIntent = normalizeCreateReplayRequest(existingRequest);
  const incomingIntent = normalizeCreateReplayRequest(input);

  if (stableStringify(existingIntent) === stableStringify(incomingIntent)) {
    return {
      kind: "duplicate",
      statusCode: 200,
      value: toSafeReplayRequestDto(existingRequest),
    };
  }

  return {
    kind: "conflict",
    statusCode: 409,
    error: conflictError(
      "idempotency_conflict",
      "idempotency conflict",
      input?.evidence_report_ref ?? existingRequest?.evidence_report_ref,
    ),
  };
}

function enforceActiveDuplicate({ activeRequests, input }) {
  if (!Array.isArray(activeRequests) || activeRequests.length === 0) {
    return { kind: "none" };
  }

  const incomingScope = stableStringify(input?.bounded_scope ?? {});
  const duplicate = activeRequests.find((request) => (
    ACTIVE_REPLAY_REQUEST_STATUSES.includes(request.status)
    && stableStringify(request.bounded_scope ?? {}) === incomingScope
  ));

  if (!duplicate) {
    return { kind: "none" };
  }

  return {
    kind: "conflict",
    statusCode: 409,
    error: conflictError(
      "active_replay_request_exists",
      "active replay request exists",
      input?.evidence_report_ref ?? duplicate.evidence_report_ref,
    ),
  };
}

function enforceStateTransition(currentStatus, action) {
  const nextStatus = STATE_TRANSITIONS[action]?.[currentStatus] ?? null;
  if (!nextStatus) {
    return {
      ok: false,
      statusCode: 409,
      error: conflictError("invalid_state_transition", "invalid state transition"),
    };
  }

  return {
    ok: true,
    from_status: currentStatus,
    to_status: nextStatus,
  };
}

function normalizeCreateReplayRequest(input) {
  return {
    idempotency_key: trimString(input.idempotency_key),
    requested_action: trimString(input.requested_action),
    bounded_scope: sortObject(input.bounded_scope ?? {}),
    target_topic: optionalTrimString(input.target_topic),
    target_table: optionalTrimString(input.target_table),
    attempt_count: input.attempt_count ?? 0,
    owner: optionalTrimString(input.owner),
    requester_ref: optionalTrimString(input.requester_ref),
    reason_summary: optionalTrimString(input.reason_summary),
    source_run_id: optionalTrimString(input.source_run_id),
    evidence_report_ref: trimString(input.evidence_report_ref),
  };
}

function buildTransitionDecision({ replayRequestId, input, operatorIdentity, action }) {
  const transition = enforceStateTransition(input?.current_status, action);
  if (!transition.ok) {
    return {
      ok: false,
      replay_request_id: replayRequestId,
      operator_ref: normalizeIdentity(operatorIdentity),
      error: transition.error,
    };
  }

  return {
    ok: true,
    replay_request_id: replayRequestId,
    operator_ref: normalizeIdentity(operatorIdentity),
    transition,
    evidence_report_ref: input?.evidence_report_ref ?? null,
  };
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.keys(value).sort().reduce((accumulator, key) => {
    accumulator[key] = sortObject(value[key]);
    return accumulator;
  }, {});
}

function normalizeIdentity(value) {
  return hasNonEmptyString(value) ? value.trim() : null;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function optionalTrimString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  CREATE_REPLAY_REQUIRED_FIELDS,
  CREATE_REPLAY_ALLOWED_FIELDS,
  REQUESTED_ACTIONS,
  ACTIVE_REPLAY_REQUEST_STATUSES,
  STATE_TRANSITIONS,
  createCdcRecoveryService,
  validateCreateReplayRequest,
  enforceIdempotency,
  enforceActiveDuplicate,
  enforceStateTransition,
  normalizeCreateReplayRequest,
  stableStringify,
};
