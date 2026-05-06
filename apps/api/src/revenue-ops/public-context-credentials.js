const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const DIRECT_ENV_KEYS = [
  "KAKAO_REST_API_KEY",
  "SEOUL_OPEN_DATA_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "KMA_SERVICE_KEY",
  "KMA_API_BASE_URL",
  "KMA_FORECAST_ENDPOINT",
  "KMA_NOWCAST_ENDPOINT",
  "KMA_DEFAULT_NX",
  "KMA_DEFAULT_NY",
  "SEOUL_OPEN_DATA_BASE_URL",
  "SEOUL_COMMERCIAL_SALES_ENDPOINT",
  "SEOUL_FOOT_TRAFFIC_ENDPOINT",
  "SEOUL_STORE_DENSITY_ENDPOINT",
];

async function loadPublicContextCredentials({
  env = process.env,
  getSecretString = getSecretStringFromSecretsManager,
  region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "ap-northeast-2",
} = {}) {
  const secretId = trimToNull(env.PUBLIC_CONTEXT_SECRET_ID);

  if (secretId) {
    try {
      const secretString = await getSecretString({ secretId, region });
      const secret = parseSecretJson(secretString);
      return normalizePublicContextCredentials({ ...env, ...secret }, "secrets_manager");
    } catch (error) {
      if (hasDirectCredentialEnv(env)) {
        return {
          ...loadPublicContextCredentialsFromEnv(env),
          credentialSource: "env_fallback_after_secret_error",
          credentialLoadWarning: sanitizeCredentialLoadError(error),
        };
      }
      return {
        ...emptyPublicContextCredentials("missing"),
        credentialSource: "secret_error",
        credentialLoadWarning: sanitizeCredentialLoadError(error),
      };
    }
  }

  return loadPublicContextCredentialsFromEnv(env);
}

function loadPublicContextCredentialsFromEnv(env = process.env) {
  return normalizePublicContextCredentials(env, hasDirectCredentialEnv(env) ? "env" : "missing");
}

async function loadPublicContextCredentialsFromSecretsManager(secretId, options = {}) {
  const secretString = await (options.getSecretString || getSecretStringFromSecretsManager)({
    secretId,
    region: options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-2",
  });
  return normalizePublicContextCredentials(parseSecretJson(secretString), "secrets_manager");
}

function normalizePublicContextCredentials(source = {}, credentialSource = "missing") {
  const dataGoKrServiceKey = trimToNull(source.DATA_GO_KR_SERVICE_KEY);
  return {
    kakaoRestApiKey: trimToNull(source.KAKAO_REST_API_KEY),
    seoulOpenDataKey: trimToNull(source.SEOUL_OPEN_DATA_KEY),
    dataGoKrServiceKey,
    kmaServiceKey: trimToNull(source.KMA_SERVICE_KEY) || dataGoKrServiceKey,
    kmaApiBaseUrl: trimToNull(source.KMA_API_BASE_URL),
    kmaForecastEndpoint: trimToNull(source.KMA_FORECAST_ENDPOINT),
    kmaNowcastEndpoint: trimToNull(source.KMA_NOWCAST_ENDPOINT),
    kmaDefaultNx: trimToNull(source.KMA_DEFAULT_NX),
    kmaDefaultNy: trimToNull(source.KMA_DEFAULT_NY),
    seoulOpenDataBaseUrl: trimToNull(source.SEOUL_OPEN_DATA_BASE_URL) || "http://openapi.seoul.go.kr:8088",
    seoulCommercialSalesEndpoint: trimToNull(source.SEOUL_COMMERCIAL_SALES_ENDPOINT),
    seoulFootTrafficEndpoint: trimToNull(source.SEOUL_FOOT_TRAFFIC_ENDPOINT),
    seoulStoreDensityEndpoint: trimToNull(source.SEOUL_STORE_DENSITY_ENDPOINT),
    credentialSource,
  };
}

function emptyPublicContextCredentials(credentialSource) {
  return normalizePublicContextCredentials({}, credentialSource);
}

async function getSecretStringFromSecretsManager({ secretId, region }) {
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return result.SecretString;
}

function parseSecretJson(secretString) {
  if (!secretString) return {};
  const parsed = JSON.parse(secretString);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function hasDirectCredentialEnv(env = {}) {
  return DIRECT_ENV_KEYS.some((key) => Boolean(trimToNull(env[key])));
}

function trimToNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskCredentialForLog(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 6) return "***";
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

function sanitizeCredentialLoadError(error) {
  return {
    name: error?.name || "CredentialLoadError",
    message: "Public context credential load failed; secret value was not logged.",
  };
}

module.exports = {
  DIRECT_ENV_KEYS,
  loadPublicContextCredentials,
  loadPublicContextCredentialsFromEnv,
  loadPublicContextCredentialsFromSecretsManager,
  maskCredentialForLog,
};
