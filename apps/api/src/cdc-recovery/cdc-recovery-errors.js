class CdcRecoveryError extends Error {
  constructor({ statusCode, code, message, evidenceReportRef } = {}) {
    super(message);
    this.name = "CdcRecoveryError";
    this.statusCode = statusCode;
    this.code = code;
    this.evidenceReportRef = evidenceReportRef ?? null;
  }
}

function validationError(message = "validation failed", evidenceReportRef) {
  return new CdcRecoveryError({
    statusCode: 400,
    code: "validation_error",
    message,
    evidenceReportRef,
  });
}

function unauthorizedError(message = "unauthorized") {
  return new CdcRecoveryError({
    statusCode: 401,
    code: "unauthorized",
    message,
  });
}

function forbiddenError(message = "forbidden") {
  return new CdcRecoveryError({
    statusCode: 403,
    code: "forbidden",
    message,
  });
}

function notFoundError(message = "not found") {
  return new CdcRecoveryError({
    statusCode: 404,
    code: "not_found",
    message,
  });
}

function conflictError(code, message, evidenceReportRef) {
  return new CdcRecoveryError({
    statusCode: 409,
    code,
    message,
    evidenceReportRef,
  });
}

function internalError(message = "internal server error") {
  return new CdcRecoveryError({
    statusCode: 500,
    code: "internal_error",
    message,
  });
}

function mapCdcRecoveryError(error) {
  if (error instanceof CdcRecoveryError) {
    return {
      statusCode: error.statusCode,
      value: buildErrorValue({
        code: error.code,
        message: error.message,
        status: error.statusCode,
        evidenceReportRef: error.evidenceReportRef,
      }),
    };
  }

  return {
    statusCode: 500,
    value: buildErrorValue({
      code: "internal_error",
      message: "internal server error",
      status: 500,
    }),
  };
}

function buildErrorValue({ code, message, status, evidenceReportRef }) {
  const error = {
    code,
    message,
    status,
  };

  if (typeof evidenceReportRef === "string" && evidenceReportRef.length > 0) {
    error.evidence_report_ref = evidenceReportRef;
  }

  return { error };
}

module.exports = {
  CdcRecoveryError,
  validationError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  internalError,
  mapCdcRecoveryError,
};
