class NotImplementedError extends Error {
  constructor(methodName) {
    super(`${methodName} is not implemented for cdc recovery repository`);
    this.name = "NotImplementedError";
  }
}

class CdcRecoveryRepository {
  listFailures(_filter, _page) {
    throw new NotImplementedError("listFailures");
  }

  getFailureById(_failureId) {
    throw new NotImplementedError("getFailureById");
  }

  listFailureStateLog(_failureId, _page) {
    throw new NotImplementedError("listFailureStateLog");
  }

  listReplayRequests(_filter, _page) {
    throw new NotImplementedError("listReplayRequests");
  }

  getReplayRequestById(_replayRequestId) {
    throw new NotImplementedError("getReplayRequestById");
  }

  findReplayRequestByIdempotencyKey(_idempotencyKey) {
    throw new NotImplementedError("findReplayRequestByIdempotencyKey");
  }

  createReplayRequest(_input) {
    throw new NotImplementedError("createReplayRequest");
  }

  appendFailureStateLog(_input) {
    throw new NotImplementedError("appendFailureStateLog");
  }

  updateFailureStatus(_failureId, _transition) {
    throw new NotImplementedError("updateFailureStatus");
  }

  updateReplayRequestStatus(_replayRequestId, _transition) {
    throw new NotImplementedError("updateReplayRequestStatus");
  }

  linkNewRunId(_replayRequestId, _newRunId) {
    throw new NotImplementedError("linkNewRunId");
  }
}

function createCdcRecoveryRepository() {
  return new CdcRecoveryRepository();
}

module.exports = {
  NotImplementedError,
  CdcRecoveryRepository,
  createCdcRecoveryRepository,
};
