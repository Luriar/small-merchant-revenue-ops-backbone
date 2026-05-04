const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

const { createServer } = require("../server");
const {
  FAILURE_RESPONSE_FIELDS,
  REPLAY_REQUEST_RESPONSE_FIELDS,
  STATE_LOG_RESPONSE_FIELDS,
} = require("./cdc-recovery-dto-mapper");
const { createCdcRecoveryRouteDispatcher } = require("./cdc-recovery-routes");
const { createCdcRecoveryStubRepository } = require("./test-support/cdc-recovery-stub-repository");

// M2-8I markers: auth missing safe 401, safe 400, safe 403, safe 404, safe 409, safe 500.
// DTO safety, OpenAPI proposal-only, no raw payloads, no full message bodies, no issue raw values.
// no prod_change payload/actor values, no stack traces, no SQL details, no persistence internals.

const ROUTES = Object.freeze({
  listFailures: "/api/v1/cdc/failures",
  failureDetail: "/api/v1/cdc/failures/cdc_fail_1",
  failureDetailMissing: "/api/v1/cdc/failures/cdc_fail_missing",
  stateLog: "/api/v1/cdc/failures/cdc_fail_1/state-log",
  createReplayRequest: "/api/v1/cdc/failures/cdc_fail_1/replay-requests",
  listReplayRequests: "/api/v1/cdc/replay-requests",
  replayRequestDetail: "/api/v1/cdc/replay-requests/cdc_replay_req_existing",
  approveReplayRequest: "/api/v1/cdc/replay-requests/cdc_replay_req_existing/approve",
  cancelReplayRequest: "/api/v1/cdc/replay-requests/cdc_replay_req_existing/cancel",
});

const ROLE_CREDENTIALS = Object.freeze({
  readonly_role: "cdc-readonly-credential-1",
  operator: "cdc-operator-credential-1",
  maintainer: "cdc-maintainer-credential-1",
  system_worker: "cdc-worker-credential-1",
});

const FORBIDDEN_KEYS = Object.freeze([
  "payload",
  "body",
  "title",
  "reporter",
  "actor",
  "raw_message",
  "message_body",
  "full_message",
  "secret",
  "password",
  "token",
  "endpoint",
  "db_url",
  "connection_string",
  "stack",
  "sql",
  "query",
  "persistence_error",
  "raw_record",
  "compared_body",
  "compared_payload",
]);

test("production route registration exposes every M2-5 CDC route through server.js", async () => {
  const server = createTestServer();

  const safeCases = [
    { method: "GET", routePath: ROUTES.listFailures, role: "readonly_role", expectedStatus: 200 },
    { method: "GET", routePath: ROUTES.failureDetail, role: "readonly_role", expectedStatus: 200 },
    { method: "GET", routePath: ROUTES.stateLog, role: "readonly_role", expectedStatus: 200 },
    { method: "GET", routePath: ROUTES.listReplayRequests, role: "readonly_role", expectedStatus: 200 },
    { method: "GET", routePath: ROUTES.replayRequestDetail, role: "readonly_role", expectedStatus: 200 },
    {
      method: "POST",
      routePath: ROUTES.createReplayRequest,
      role: "operator",
      input: validCreateInput("idem-production-route-all"),
      expectedStatus: 201,
    },
    {
      method: "POST",
      routePath: ROUTES.approveReplayRequest,
      role: "maintainer",
      input: approvalInput(),
      expectedStatus: 200,
    },
    {
      method: "POST",
      routePath: ROUTES.cancelReplayRequest,
      role: "maintainer",
      input: approvalInput(),
      expectedStatus: 200,
    },
  ];

  for (const safeCase of safeCases) {
    const result = await requestJson({ server, ...safeCase });
    assert.equal(result.statusCode, safeCase.expectedStatus);
    assertNoForbiddenKeys(result.value);
  }
});

test("production route auth behavior preserves M2 role boundaries", async () => {
  const server = createTestServer();

  assertSafeError(
    await requestJson({ server, method: "GET", routePath: ROUTES.listFailures }),
    401,
    "unauthorized",
  );

  const readResult = await requestJson({
    server,
    method: "GET",
    routePath: ROUTES.listFailures,
    role: "readonly_role",
  });
  assert.equal(readResult.statusCode, 200);

  assertSafeError(
    await requestJson({
      server,
      method: "POST",
      routePath: ROUTES.createReplayRequest,
      role: "readonly_role",
      input: validCreateInput("idem-readonly-production-denied"),
    }),
    403,
    "forbidden",
  );

  const createResult = await requestJson({
    server,
    method: "POST",
    routePath: ROUTES.createReplayRequest,
    role: "operator",
    input: validCreateInput("idem-operator-production-create"),
  });
  assert.equal(createResult.statusCode, 201);

  assertSafeError(
    await requestJson({
      server,
      method: "POST",
      routePath: ROUTES.approveReplayRequest,
      role: "operator",
      input: approvalInput(),
    }),
    403,
    "forbidden",
  );

  const approveResult = await requestJson({
    server,
    method: "POST",
    routePath: ROUTES.approveReplayRequest,
    role: "maintainer",
    input: approvalInput(),
  });
  assert.equal(approveResult.statusCode, 200);

  assertSafeError(
    await requestJson({
      server,
      method: "POST",
      routePath: ROUTES.createReplayRequest,
      role: "system_worker",
      input: validCreateInput("idem-worker-production-denied"),
    }),
    403,
    "forbidden",
  );
});

test("production route errors stay safe for validation, not found, conflict, transition, and internal cases", async () => {
  const server = createTestServer();

  assertSafeError(
    await requestJson({
      server,
      method: "POST",
      routePath: ROUTES.createReplayRequest,
      role: "operator",
      input: {
        requested_action: "replay",
        bounded_scope: {
          scope_kind: "single_failure",
        },
        evidence_report_ref: "ops/evidence/production-route-test.md",
      },
    }),
    400,
    "validation_error",
  );

  assertSafeError(
    await requestJson({
      server,
      method: "GET",
      routePath: ROUTES.failureDetailMissing,
      role: "readonly_role",
    }),
    404,
    "not_found",
  );

  assertSafeError(
    await requestJson({
      server,
      method: "POST",
      routePath: ROUTES.createReplayRequest,
      role: "operator",
      input: {
        ...existingCreateInput(),
        bounded_scope: {
          scope_kind: "single_failure",
          primary_key_ref: "trace:tr_safe_different",
          max_records: 1,
        },
      },
    }),
    409,
    "idempotency_conflict",
  );

  const repository = createCdcRecoveryStubRepository();
  repository.updateReplayRequestStatus("cdc_replay_req_existing", { to_status: "succeeded" });
  const conflictServer = createTestServer({
    cdcRecoveryRoutes: createCdcRecoveryRouteDispatcher({ env: authEnv(), repository }),
  });
  assertSafeError(
    await requestJson({
      server: conflictServer,
      method: "POST",
      routePath: ROUTES.approveReplayRequest,
      role: "maintainer",
      input: approvalInput(),
    }),
    409,
    "invalid_state_transition",
  );
  assertSafeError(
    await requestJson({
      server: conflictServer,
      method: "POST",
      routePath: ROUTES.cancelReplayRequest,
      role: "maintainer",
      input: approvalInput(),
    }),
    409,
    "invalid_state_transition",
  );

  const failingRepository = createCdcRecoveryStubRepository({ failMethods: ["listFailures"] });
  const failureServer = createTestServer({
    cdcRecoveryRoutes: createCdcRecoveryRouteDispatcher({
      env: authEnv(),
      repository: failingRepository,
    }),
  });
  assertSafeError(
    await requestJson({
      server: failureServer,
      method: "GET",
      routePath: ROUTES.listFailures,
      role: "maintainer",
    }),
    500,
    "internal_error",
  );
});

test("production route outputs preserve DTO safety and OpenAPI proposal-only parity", async () => {
  const proposal = fs.readFileSync(
    path.join(__dirname, "../../../..", "sources/openapi_m2_5_dlq_replay_patch.yaml"),
    "utf8",
  );
  assert.match(proposal, /PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY/);
  assert.match(proposal, /CdcFailureSummary/);
  assert.match(proposal, /CdcReplayRequestSummary/);

  const server = createTestServer();

  const failureList = await requestJson({
    server,
    method: "GET",
    routePath: ROUTES.listFailures,
    role: "readonly_role",
  });
  const stateLog = await requestJson({
    server,
    method: "GET",
    routePath: ROUTES.stateLog,
    role: "readonly_role",
  });
  const replayDetail = await requestJson({
    server,
    method: "GET",
    routePath: ROUTES.replayRequestDetail,
    role: "readonly_role",
  });

  assertSafeFieldSet(failureList.value.items[0], FAILURE_RESPONSE_FIELDS);
  assertSafeFieldSet(stateLog.value.items[0], STATE_LOG_RESPONSE_FIELDS);
  assertSafeFieldSet(replayDetail.value, REPLAY_REQUEST_RESPONSE_FIELDS);
  assertNoForbiddenKeys(failureList.value);
  assertNoForbiddenKeys(stateLog.value);
  assertNoForbiddenKeys(replayDetail.value);
});

test("production registration does not break an existing non-CDC route", async () => {
  const server = createTestServer();

  const result = await requestJson({
    server,
    method: "GET",
    routePath: "/healthz",
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.value, {
    status: "ok",
  });
});

function validCreateInput(idempotencyKey) {
  return {
    idempotency_key: idempotencyKey,
    requested_action: "replay",
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:tr_safe_1",
      max_records: 1,
    },
    target_topic: "cdc.safe.trace",
    target_table: "trace",
    attempt_count: 1,
    owner: "ops-maintainer",
    requester_ref: "operator-ref",
    reason_summary: "safe replay reason",
    source_run_id: "run_source_1",
    evidence_report_ref: "ops/evidence/production-route-test.md",
  };
}

function existingCreateInput() {
  return {
    ...validCreateInput("idem-existing"),
    evidence_report_ref: "ops/evidence/cdc-replay-existing.md",
  };
}

function approvalInput() {
  return {
    evidence_report_ref: "ops/evidence/approval-production-route-test.md",
  };
}

async function requestJson({ server, method, routePath, role, input }) {
  const headers = {};
  if (role) {
    headers.authorization = `Bearer ${ROLE_CREDENTIALS[role]}`;
  }
  let content = null;
  if (typeof input !== "undefined") {
    headers["content-type"] = "application/json";
    content = JSON.stringify(input);
  }

  const response = await dispatchServerRequest({
    server,
    method,
    routePath,
    headers,
    content,
  });

  return {
    statusCode: response.status,
    value: JSON.parse(response.text),
  };
}

function createTestServer(options = {}) {
  return createServer({
    env: authEnv(),
    changeStore: {},
    eventStore: {},
    issueStore: {},
    runStore: {},
    traceStore: {},
    logger: createSilentLogger(),
    ...options,
  });
}

function dispatchServerRequest({ server, method, routePath, headers, content }) {
  const request = Readable.from(content === null ? [] : [Buffer.from(content)]);
  request.method = method;
  request.url = routePath;
  request.headers = headers;

  const response = new FakeResponse();
  server.emit("request", request, response);
  return response.done;
}

function authEnv() {
  return {
    CDC_READONLY_BEARER_TOKEN: ROLE_CREDENTIALS.readonly_role,
    CDC_OPERATOR_BEARER_TOKEN: ROLE_CREDENTIALS.operator,
    CDC_MAINTAINER_BEARER_TOKEN: ROLE_CREDENTIALS.maintainer,
    CDC_SYSTEM_WORKER_BEARER_TOKEN: ROLE_CREDENTIALS.system_worker,
  };
}

function createSilentLogger() {
  return {
    info() {},
  };
}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.writableFinished = false;
    this.chunks = [];
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  }

  end(value = "") {
    if (value) {
      this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    }
    this.writableFinished = true;
    const text = Buffer.concat(this.chunks).toString("utf8");
    this.emit("finish");
    this.emit("close");
    this.resolveDone({
      status: this.statusCode,
      text,
      headers: this.headers,
    });
  }
}

function assertSafeError(result, statusCode, code) {
  assert.equal(result.statusCode, statusCode);
  assert.equal(result.value.error.code, code);
  assert.equal(result.value.error.status, statusCode);
  assertNoForbiddenKeys(result.value);
}

function assertSafeFieldSet(value, allowedFields) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    assert.equal(allowed.has(key), true, `unexpected safe field: ${key}`);
  }
}

function assertNoForbiddenKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, [...trail, String(index)]));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      FORBIDDEN_KEYS.includes(key),
      false,
      `forbidden key found at ${[...trail, key].join(".")}`,
    );
    assertNoForbiddenKeys(child, [...trail, key]);
  }
}
