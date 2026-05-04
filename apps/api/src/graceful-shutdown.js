const { METRIC_NAMES, emitCount, emitGauge } = require("./metrics");

function registerGracefulShutdown({
  server,
  logger,
  metrics,
  processLike = process,
  signals = ["SIGINT", "SIGTERM"],
  drainTimeoutMs = 5000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let shuttingDown = false;
  let timeoutHandle = null;
  let forcedCleanup = false;
  const handlers = new Map();
  const sockets = new Set();
  let activeRequests = 0;

  const onConnection = (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  };

  const onRequest = (_request, response) => {
    activeRequests += 1;
    let finalized = false;

    const finalize = () => {
      if (finalized) {
        return;
      }

      finalized = true;
      activeRequests = Math.max(0, activeRequests - 1);
    };

    response.once("finish", finalize);
    response.once("close", finalize);
  };

  server.on("connection", onConnection);
  server.on("request", onRequest);

  for (const signal of signals) {
    const handler = () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      logger.info("server_shutdown_started", {
        signal,
        drain_timeout_ms: drainTimeoutMs,
        active_requests: activeRequests,
        open_connections: sockets.size,
      });
      emitCount(metrics, METRIC_NAMES.SERVER_SHUTDOWN_STARTED_TOTAL, 1, { signal });
      emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_ACTIVE_REQUESTS, activeRequests, { signal });
      emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_OPEN_CONNECTIONS, sockets.size, { signal });

      timeoutHandle = setTimeoutFn(() => {
        forcedCleanup = true;
        let destroyedConnections = 0;

        for (const socket of sockets) {
          if (!socket.destroyed && typeof socket.destroy === "function") {
            socket.destroy();
            destroyedConnections += 1;
          }
        }

        logger.info("server_shutdown_timeout", {
          signal,
          drain_timeout_ms: drainTimeoutMs,
          active_requests: activeRequests,
          open_connections: sockets.size,
          destroyed_connections: destroyedConnections,
        });
        emitCount(metrics, METRIC_NAMES.SERVER_SHUTDOWN_TIMEOUT_TOTAL, 1, { signal });
        emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_ACTIVE_REQUESTS, activeRequests, { signal });
        emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_OPEN_CONNECTIONS, sockets.size, { signal });
        emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_DESTROYED_CONNECTIONS, destroyedConnections, { signal });
      }, drainTimeoutMs);

      server.close((error) => {
        if (timeoutHandle) {
          clearTimeoutFn(timeoutHandle);
          timeoutHandle = null;
        }

        if (error) {
          logger.info("server_shutdown_failed", {
            signal,
            drain_timeout_ms: drainTimeoutMs,
          });
          emitCount(metrics, METRIC_NAMES.SERVER_SHUTDOWN_FAILED_TOTAL, 1, { signal });

          if (processLike) {
            processLike.exitCode = 1;
          }
          return;
        }

        logger.info("server_shutdown_completed", {
          signal,
          drain_timeout_ms: drainTimeoutMs,
          active_requests: activeRequests,
          open_connections: sockets.size,
          forced_cleanup: forcedCleanup,
        });
        emitCount(metrics, METRIC_NAMES.SERVER_SHUTDOWN_COMPLETED_TOTAL, 1, {
          signal,
          forced_cleanup: forcedCleanup,
        });
        emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_ACTIVE_REQUESTS, activeRequests, { signal });
        emitGauge(metrics, METRIC_NAMES.SERVER_SHUTDOWN_OPEN_CONNECTIONS, sockets.size, { signal });
      });
    };

    handlers.set(signal, handler);
    processLike.on(signal, handler);
  }

  return () => {
    if (timeoutHandle) {
      clearTimeoutFn(timeoutHandle);
      timeoutHandle = null;
    }

    server.removeListener("connection", onConnection);
    server.removeListener("request", onRequest);

    for (const [signal, handler] of handlers.entries()) {
      processLike.removeListener(signal, handler);
    }
  };
}

module.exports = {
  registerGracefulShutdown,
};
