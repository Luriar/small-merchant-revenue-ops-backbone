const { CdcRecoveryError, mapCdcRecoveryError } = require("../cdc-recovery-errors");

function adaptCdcRecoveryTestError(error) {
  if (error instanceof CdcRecoveryError) {
    return mapCdcRecoveryError(error);
  }

  return {
    statusCode: 500,
    value: {
      error: {
        code: "internal_error",
        message: "internal server error",
        status: 500,
      },
    },
  };
}

module.exports = {
  adaptCdcRecoveryTestError,
};
