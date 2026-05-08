type RevenueImportMeta = ImportMeta & {
  readonly env?: Record<string, string | undefined>;
};

const viteEnv = (import.meta as RevenueImportMeta).env ?? {};

const CLIENT_ID = viteEnv.VITE_REVENUE_COGNITO_CLIENT_ID || '6ckcj7igctutanc2s6cjo3vjs7';
const HOSTED_UI = viteEnv.VITE_REVENUE_COGNITO_HOSTED_UI || 'https://revenue-ops-dev-827913617635.auth.ap-northeast-2.amazoncognito.com';
const REDIRECT_URI = viteEnv.VITE_REVENUE_COGNITO_REDIRECT_URI || 'https://d1fquuc7vsf9cu.cloudfront.net/';
const LOGOUT_URI = viteEnv.VITE_REVENUE_COGNITO_LOGOUT_URI || REDIRECT_URI;
const REGION = viteEnv.VITE_REVENUE_COGNITO_REGION || 'ap-northeast-2';
const IDP_ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

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

function isUsableJwt(token: unknown): token is string {
  if (typeof token !== 'string' || token.split('.').length < 3) return false;

  try {
    const claims = decodeJwtPayload(token);
    const exp = typeof claims.exp === 'number' ? claims.exp : null;
    if (!exp) return true;
    return exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

export function getStoredCognitoToken(): string | null {
  const raw = sessionStorage.getItem(TOKENS_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<RevenueAuthSession>;
    if (isUsableJwt(session.id_token)) return session.id_token;
    if (isUsableJwt(session.access_token)) return session.access_token;
    return null;
  } catch {
    return null;
  }
}

export function getStoredAuthSession(): RevenueAuthSession | null {
  const raw = sessionStorage.getItem(TOKENS_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as RevenueAuthSession;
    if (!getStoredCognitoToken()) return null;
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
    throw new Error('Login state mismatch. Please retry login.');
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
    throw new Error(body.error || 'Login token exchange failed.');
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

// ─── Direct Cognito IDP calls (in-app popover) ──────────────────────────────
// The SPA app client is public (no client secret) and is configured with
// ALLOW_USER_PASSWORD_AUTH, so the popover can call InitiateAuth directly.
// All requests POST to the regional Cognito IDP endpoint with X-Amz-Target.

export class CognitoAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoAuthError';
    this.code = code;
  }
}

interface CognitoErrorResponse {
  __type?: string;
  message?: string;
  Message?: string;
}

async function cognitoCall<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(IDP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { message: text }; }
  }

  if (!response.ok) {
    const err = parsed as CognitoErrorResponse;
    const rawType = typeof err.__type === 'string' ? err.__type : '';
    const code = rawType.split('#').pop() || rawType || `Http${response.status}`;
    const message = err.message || err.Message || `Cognito ${target} failed (${response.status})`;
    throw new CognitoAuthError(code, message);
  }

  return parsed as T;
}

interface InitiateAuthResponse {
  AuthenticationResult?: {
    AccessToken: string;
    IdToken: string;
    RefreshToken?: string;
    ExpiresIn: number;
    TokenType: string;
  };
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
}

function persistSessionFromAuthResult(authResult: NonNullable<InitiateAuthResponse['AuthenticationResult']>) {
  const claims = decodeJwtPayload(authResult.IdToken);
  const session: RevenueAuthSession = {
    access_token: authResult.AccessToken,
    id_token: authResult.IdToken,
    refresh_token: authResult.RefreshToken,
    token_type: authResult.TokenType || 'Bearer',
    expires_in: authResult.ExpiresIn || 3600,
    saved_at: Date.now(),
    email: typeof claims.email === 'string' ? claims.email : undefined,
  };
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent('revenue-ops-auth-changed', {
    detail: { email: session.email, saved_at: session.saved_at },
  }));
  return session;
}

export async function cognitoSignIn(email: string, password: string): Promise<RevenueAuthSession> {
  const response = await cognitoCall<InitiateAuthResponse>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });

  if (!response.AuthenticationResult) {
    throw new CognitoAuthError(
      response.ChallengeName || 'ChallengeRequired',
      'Additional authentication step required. Please contact support.',
    );
  }

  return persistSessionFromAuthResult(response.AuthenticationResult);
}

interface SignUpResponse {
  UserConfirmed?: boolean;
  UserSub?: string;
  CodeDeliveryDetails?: { Destination?: string; DeliveryMedium?: string; AttributeName?: string };
}

export async function cognitoSignUp(email: string, password: string): Promise<SignUpResponse> {
  return cognitoCall<SignUpResponse>('SignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
}

export async function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  await cognitoCall('ConfirmSignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function cognitoResendSignUpCode(email: string): Promise<void> {
  await cognitoCall('ResendConfirmationCode', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  await cognitoCall('ForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

export async function cognitoConfirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  await cognitoCall('ConfirmForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}
