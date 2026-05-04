const { validateAuthConfig } = require("./auth");
const { configInvalid } = require("./error-response");

const AURORA_BACKEND_ENV_KEYS = Object.freeze([
  "CHANGE_STORE_BACKEND",
  "EVENT_STORE_BACKEND",
  "ISSUE_STORE_BACKEND",
  "RUN_STORE_BACKEND",
  "TRACE_STORE_BACKEND",
]);

function getStartupConfig({ env = process.env } = {}) {
  const auroraBackends = AURORA_BACKEND_ENV_KEYS.filter((key) => env[key] === "aurora");
  const hasDatabaseUrl = hasNonEmptyString(env.AURORA_DATABASE_URL) || hasNonEmptyString(env.DATABASE_URL);

  return {
    auroraBackends,
    hasDatabaseUrl,
    authConfig: validateAuthConfig({ env }),
  };
}

function validateStartupConfig({ env = process.env } = {}) {
  const config = getStartupConfig({ env });

  if (config.auroraBackends.length > 0 && !config.hasDatabaseUrl) {
    const backendKeys = config.auroraBackends.join(", ");
    throw configInvalid(
      `startup config invalid: Aurora-backed store enabled (${backendKeys}) but AURORA_DATABASE_URL or DATABASE_URL is required`,
    );
  }

  return config;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  getStartupConfig,
  validateStartupConfig,
};
