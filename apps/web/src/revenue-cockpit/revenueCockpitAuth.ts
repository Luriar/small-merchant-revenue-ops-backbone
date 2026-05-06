type RevenueImportMeta = ImportMeta & {
  readonly env?: Record<string, string | undefined>;
};

const viteEnv = (import.meta as RevenueImportMeta).env ?? {};

const CLIENT_ID = viteEnv.VITE_REVENUE_COGNITO_CLIENT_ID || '6ckcj7igctutanc2s6cjo3vjs7';
const HOSTED_UI = viteEnv.VITE_REVENUE_COGNITO_HOSTED_UI || 'https://revenue-ops-dev-827913617635.auth.ap-northeast-2.amazoncognito.com';
const REDIRECT_URI = viteEnv.VITE_REVENUE_COGNITO_REDIRECT_URI || 'https://d1fquuc7vsf9cu.cloudfront.net/';
const LOGOUT_URI = viteEnv.VITE_REVENUE_COGNITO_LOGOUT_URI || REDIRECT_URI;

const STORAGE_PREFIX = 'revenue_ops_cognito';
const VERIFIER_KEY = `${STORAGE_PREFIX}_code_verifier`;
const STATE_KEY = `${STORAGE_PREFIX}_state`;
const TOKENS_KEY = `${STORAGE_PREFIX}_tokens`;

export interface RevenueAuthSession {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  saved_at: number;
  email?: string;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlFromBytes(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) return {};
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
  return JSON.parse(atob(padded));
}

export function getStoredAuthSession(): RevenueAuthSession | null {
  const raw = sessionStorage.getItem(TOKENS_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as RevenueAuthSession;
    if (!session.access_token || !session.id_token) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearStoredAuthSession() {
  sessionStorage.removeItem(TOKENS_KEY);
  sessionStorage.removeItem('revenue_ops_selected_store_id');
}

export function markRevenueLogoutRedirect() {
  sessionStorage.setItem('revenue_ops_after_logout', '1');
}

export async function startCognitoLogin() {
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(24);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.assign(`${HOSTED_UI.replace(/\/$/, '')}/login?${params.toString()}`);
}

export async function handleCognitoRedirectIfPresent(): Promise<RevenueAuthSession | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) return null;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  if (!state || !expectedState || state !== expectedState || !verifier) {
    throw new Error('Cognito state/verifier mismatch. Please retry login.');
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const response = await fetch(`${HOSTED_UI.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams,
  });

  const body = await response.json();

  if (!response.ok || !body.access_token || !body.id_token) {
    throw new Error(body.error || 'Cognito token exchange failed.');
  }

  const claims = decodeJwtPayload(body.id_token);
  const session: RevenueAuthSession = {
    access_token: body.access_token,
    id_token: body.id_token,
    refresh_token: body.refresh_token,
    token_type: body.token_type || 'Bearer',
    expires_in: body.expires_in || 3600,
    saved_at: Date.now(),
    email: typeof claims.email === 'string' ? claims.email : undefined,
  };

  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(session));
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  window.history.replaceState(null, '', `${window.location.origin}/#revenue-cockpit?data=api`);
  window.dispatchEvent(new CustomEvent('revenue-ops-auth-changed', {
    detail: {
      email: session.email,
      saved_at: session.saved_at,
    },
  }));

  return session;
}

export function buildCognitoLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: LOGOUT_URI,
  });

  return `${HOSTED_UI.replace(/\/$/, '')}/logout?${params.toString()}`;
}
