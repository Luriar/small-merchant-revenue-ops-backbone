const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { registerGracefulShutdown } = require("./graceful-shutdown");
const { FORBIDDEN_TAG_KEYS } = require("./metrics");

test("graceful shutdown closes server on SIGTERM", async () => {
  const logs = [];
  const processLike = new EventEmitter();
  const server = new EventEmitter();
  const timeoutHandles = [];
  server.close = (callback) => {
    setImmediate(() => callback(null));
  };

  const cleanup = registerGracefulShutdown({
    server,
    logger: createTestLogger(logs),
    processLike,
    drainTimeoutMs: 25,
    setTimeoutFn(callback) {
      const handle = { callback };
      timeoutHandles.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      const index = timeoutHandles.indexOf(handle);
      if (index >= 0) {
        timeoutHandles.splice(index, 1);
      }
    },
  });

  processLike.emit("SIGTERM");
  await waitForImmediate();
  cleanup();

  assert.equal(logs[0].event, "server_shutdown_started");
  assert.equal(logs[0].signal, "SIGTERM");
  assert.equal(logs[0].drain_timeout_ms, 25);
  assert.equal(logs[1].event, "server_shutdown_completed");
  assert.equal(logs[1].signal, "SIGTERM");
  assert.equal(logs[1].forced_cleanup, false);
  assert.equal(timeoutHandles.length, 0);
});

test("graceful shutdown timeout destroys lingering connections", async () => {
  const logs = [];
  const processLike = new EventEmitter();
  const server = new EventEmitter();
  let closeCallback = null;
  const socket = createSocket();

  server.close = (callback) => {
    closeCallback = callback;
  };

  const cleanup = registerGracefulShutdown({
    server,
    logger: createTestLogger(logs),
    processLike,
    drainTimeoutMs: 5,
  });

  server.emit("connection", socket);
  processLike.emit("SIGTERM");
  await wait(15);

  assert.equal(socket.destroyed, true);

  closeCallback(null);
  await waitForImmediate();
  cleanup();

  const timeoutLog = logs.find((entry) => entry.event === "server_shutdown_timeout");
  assert.ok(timeoutLog);
  assert.equal(timeoutLog.signal, "SIGTERM");
  assert.equal(timeoutLog.destroyed_connections, 1);

  const completedLog = logs.find((entry) => entry.event === "server_shutdown_completed");
  assert.ok(completedLog);
  assert.equal(completedLog.forced_cleanup, true);
});

test("graceful shutdown does not close server twice", async () => {
  const logs = [];
  const processLike = new EventEmitter();
  let closeCount = 0;
  const server = new EventEmitter();
  server.close = (callback) => {
    closeCount += 1;
    setImmediate(() => callback(null));
  };

  const cleanup = registerGracefulShutdown({
    server,
    logger: createTestLogger(logs),
    processLike,
  });

  processLike.emit("SIGINT");
  processLike.emit("SIGTERM");
  await waitForImmediate();
  cleanup();

  assert.equal(closeCount, 1);
  assert.equal(logs.filter((entry) => entry.event === "server_shutdown_started").length, 1);
});

test("graceful shutdown logs active requests and open connections", async () => {
  const logs = [];
  const processLike = new EventEmitter();
  const server = new EventEmitter();
  const response = new EventEmitter();
  server.close = (callback) => {
    setImmediate(() => callback(null));
  };

  const cleanup = registerGracefulShutdown({
    server,
    logger: createTestLogger(logs),
    processLike,
  });

  server.emit("connection", createSocket());
  server.emit("request", {}, response);
  processLike.emit("SIGINT");
  await waitForImmediate();
  cleanup();

  assert.equal(logs[0].event, "server_shutdown_started");
  assert.equal(logs[0].active_requests, 1);
  assert.equal(logs[0].open_connections, 1);
});

test("graceful shutdown emits metrics with safe tags", async () => {
  const calls = [];
  const processLike = new EventEmitter();
  const server = new EventEmitter();
  server.close = (callback) => {
    setImmediate(() => callback(null));
  };

  const cleanup = registerGracefulShutdown({
    server,
    logger: createTestLogger([]),
    metrics: createTestMetrics(calls),
    processLike,
  });

  processLike.emit("SIGTERM");
  await waitForImmediate();
  cleanup();

  assert.equal(calls.some((call) => call.name === "server_shutdown_started_total"), true);
  assert.equal(calls.some((call) => call.name === "server_shutdown_completed_total"), true);
  for (const call of calls) {
    for (const key of Object.keys(call.tags)) {
      assert.equal(FORBIDDEN_TAG_KEYS.has(key), false);
    }
  }
});

function createSocket() {
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.destroy = () => {
    socket.destroyed = true;
    socket.emit("close");
  };
  return socket;
}

function createTestLogger(logs) {
  return {
    info(event, fields) {
      logs.push({ event, ...(fields ?? {}) });
    },
  };
}

function createTestMetrics(calls) {
  return {
    count(name, value, tags) {
      calls.push({ kind: "count", name, value, tags });
    },
    histogram(name, value, tags) {
      calls.push({ kind: "histogram", name, value, tags });
    },
    gauge(name, value, tags) {
      calls.push({ kind: "gauge", name, value, tags });
    },
  };
}

function waitForImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
