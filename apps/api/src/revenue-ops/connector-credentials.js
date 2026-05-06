const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const TOSS_PLACE_EXPECTED_SECRET_ID = "/revenue-ops/revenue-dev/connectors/toss-place";
const DELIVERY_PROVIDER_EXPECTED_SECRET_ID = "/revenue-ops/revenue-dev/connectors/delivery-provider";

async function loadRevenueConnectorCredentials({
  env = process.env,
  getSecretString = getSecretStringFromSecretsManager,
  region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "ap-northeast-2",
} = {}) {
  const [tossPlace, deliveryProvider] = await Promise.all([
    loadTossPlaceCredentials({ env, getSecretString, region }),
    loadDeliveryProviderCredentials({ env, getSecretString, region }),
  ]);
  return { tossPlace, deliveryProvider };
}

async function loadTossPlaceCredentials({ env = process.env, getSecretString = getSecretStringFromSecretsManager, region } = {}) {
  return loadOptionalConnectorSecret({
    env,
    getSecretString,
    region,
    secretId: trimToNull(env.TOSS_PLACE_SECRET_ID) || trimToNull(env.TOSS_PLACE_SECRET_PATH),
    expectedSecretId: TOSS_PLACE_EXPECTED_SECRET_ID,
    hasDirect: hasDirectTossPlaceEnv,
    normalize: normalizeTossPlaceCredentials,
    connectorName: "toss_place",
  });
}

async function loadDeliveryProviderCredentials({ env = process.env, getSecretString = getSecretStringFromSecretsManager, region } = {}) {
  return loadOptionalConnectorSecret({
    env,
    getSecretString,
    region,
    secretId: trimToNull(env.DELIVERY_PROVIDER_SECRET_ID) || trimToNull(env.DELIVERY_PROVIDER_SECRET_PATH),
    expectedSecretId: DELIVERY_PROVIDER_EXPECTED_SECRET_ID,
    hasDirect: hasDirectDeliveryProviderEnv,
    normalize: normalizeDeliveryProviderCredentials,
    connectorName: "delivery_provider",
  });
}

async function loadOptionalConnectorSecret({
  env,
  getSecretString,
  region,
  secretId,
  expectedSecretId,
  hasDirect,
  normalize,
  connectorName,
}) {
  if (hasDirect(env)) {
    return normalize(env, {
      credentialSource: "env",
      expectedSecretId,
      configured: true,
    });
  }

  if (!secretId) {
    return normalize({}, {
      credentialSource: "missing",
      expectedSecretId,
      configured: false,
    });
  }

  try {
    const secretString = await getSecretString({ secretId, region });
    const secret = parseSecretJson(secretString);
    return normalize({ ...env, ...secret }, {
      credentialSource: "secrets_manager",
      secretId,
      expectedSecretId,
      configured: true,
    });
  } catch (error) {
    return normalize({}, {
      credentialSource: "secret_error",
      secretId,
      expectedSecretId,
      configured: false,
      credentialLoadWarning: sanitizeConnectorCredentialLoadError(error, connectorName),
    });
  }
}

function normalizeTossPlaceCredentials(source = {}, meta = {}) {
  const accessKey = trimToNull(source.TOSS_PLACE_ACCESS_KEY);
  const secretKey = trimToNull(source.TOSS_PLACE_SECRET_KEY);
  const apiBaseUrl = trimToNull(source.TOSS_PLACE_API_BASE_URL);
  const versionPath = trimToNull(source.TOSS_PLACE_VERSION_PATH) || "/api-public/openapi/v1/version";
  return {
    connector: "toss_place",
    configured: Boolean(meta.configured && accessKey && secretKey && apiBaseUrl),
    credentialSource: meta.credentialSource || "missing",
    credentialLoadWarning: meta.credentialLoadWarning || null,
    secretId: meta.secretId || null,
    expectedSecretId: meta.expectedSecretId || TOSS_PLACE_EXPECTED_SECRET_ID,
    apiBaseUrl,
    accessKey,
    secretKey,
    storeId: trimToNull(source.TOSS_PLACE_STORE_ID),
    versionPath,
    merchantPath: trimToNull(source.TOSS_PLACE_MERCHANT_PATH),
    ordersPath: trimToNull(source.TOSS_PLACE_ORDERS_PATH),
    paymentsPath: trimToNull(source.TOSS_PLACE_PAYMENTS_PATH),
  };
}

function normalizeDeliveryProviderCredentials(source = {}, meta = {}) {
  const providerKind = trimToNull(source.DELIVERY_PROVIDER_KIND);
  const clientId = trimToNull(source.DELIVERY_PROVIDER_CLIENT_ID);
  const clientSecret = trimToNull(source.DELIVERY_PROVIDER_CLIENT_SECRET);
  const token = trimToNull(source.DELIVERY_PROVIDER_TOKEN);
  const apiBaseUrl = trimToNull(source.DELIVERY_PROVIDER_API_BASE_URL);
  return {
    connector: "delivery_provider",
    configured: Boolean(meta.configured && providerKind && (providerKind === "mock" || (apiBaseUrl && clientId && (clientSecret || token)))),
    credentialSource: meta.credentialSource || "missing",
    credentialLoadWarning: meta.credentialLoadWarning || null,
    secretId: meta.secretId || null,
    expectedSecretId: meta.expectedSecretId || DELIVERY_PROVIDER_EXPECTED_SECRET_ID,
    providerKind,
    apiBaseUrl,
    clientId,
    clientSecret,
    token,
  };
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

function hasDirectTossPlaceEnv(env = {}) {
  return Boolean(
    trimToNull(env.TOSS_PLACE_API_BASE_URL)
    || trimToNull(env.TOSS_PLACE_ACCESS_KEY)
    || trimToNull(env.TOSS_PLACE_SECRET_KEY)
  );
}

function hasDirectDeliveryProviderEnv(env = {}) {
  return Boolean(
    trimToNull(env.DELIVERY_PROVIDER_KIND)
    || trimToNull(env.DELIVERY_PROVIDER_API_BASE_URL)
    || trimToNull(env.DELIVERY_PROVIDER_CLIENT_ID)
    || trimToNull(env.DELIVERY_PROVIDER_TOKEN)
  );
}

function trimToNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeConnectorCredentialLoadError(error, connectorName) {
  return {
    connector: connectorName,
    name: error?.name || "CredentialLoadError",
    message: "Connector credential load failed; secret value was not logged.",
  };
}

module.exports = {
  TOSS_PLACE_EXPECTED_SECRET_ID,
  DELIVERY_PROVIDER_EXPECTED_SECRET_ID,
  loadRevenueConnectorCredentials,
  loadTossPlaceCredentials,
  loadDeliveryProviderCredentials,
  normalizeTossPlaceCredentials,
  normalizeDeliveryProviderCredentials,
};
