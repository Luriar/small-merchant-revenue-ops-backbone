import { getStoredAuthSession } from './revenueCockpitAuth';

const DEFAULT_API_ORIGIN = 'https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com';
const API_ROOT = '/api/v1';
const REVENUE_PATH = `${API_ROOT}/revenue`;

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const configuredOrigin = env?.VITE_REVENUE_API_BASE_URL?.replace(/\/+$/, '');
const ORIGIN = configuredOrigin || DEFAULT_API_ORIGIN;
const LEGACY_BASE = `${ORIGIN}${REVENUE_PATH}`;
const ROOT_BASE = `${ORIGIN}${API_ROOT}`;

export interface RevenueStoreSummary {
  store_id: string;
  tenant_id?: string;
  tenant_name?: string | null;
  tenant_type?: string | null;
  store_name: string;
  store_type?: string;
  business_category?: string | null;
  region?: string | null;
  address_text?: string | null;
  timezone?: string;
  member_role?: string;
  status?: string;
}

export interface CreateRevenueStorePayload {
  store_name: string;
  tenant_name?: string;
  business_category?: string;
  region?: string;
  address_text?: string;
  timezone?: string;
}

export interface ActionStatusUpdateEnvelope {
  action?: {
    action_id?: string;
    status?: string;
  };
  status_persistence?: 'aurora' | 'memory' | 'memory_fallback' | string;
}

function withAuthHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  const session = getStoredAuthSession();

  if (session?.access_token && !merged.has('Authorization')) {
    merged.set('Authorization', `${session.token_type || 'Bearer'} ${session.access_token}`);
  }

  return merged;
}

async function fetchJson(url: string, init: RequestInit = {}, label = url) {
  const res = await fetch(url, {
    ...init,
    headers: withAuthHeaders(init.headers),
  });

  if (!res.ok) {
    throw new Error(`${label} ${res.status}`);
  }

  return res.json();
}

function storeScopedPath(storeId: string, path: string) {
  return `${ROOT_BASE}/stores/${encodeURIComponent(storeId)}${path}`;
}

function legacyPath(path: string) {
  return `${LEGACY_BASE}${path}`;
}

export async function apiFetchMe() {
  return fetchJson(`${ROOT_BASE}/me`, {}, 'me');
}

export async function apiFetchStores(): Promise<{ stores?: RevenueStoreSummary[] }> {
  return fetchJson(`${ROOT_BASE}/stores`, {}, 'stores');
}

export async function apiCreateStore(payload: CreateRevenueStorePayload): Promise<{ store?: RevenueStoreSummary }> {
  return fetchJson(
    `${ROOT_BASE}/stores`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'create store',
  );
}

export async function apiFetchBriefs(storeId?: string) {
  return fetchJson(storeId ? storeScopedPath(storeId, '/briefs') : legacyPath('/briefs'), {}, 'briefs');
}

export async function apiFetchAnomalies(storeId?: string) {
  return fetchJson(storeId ? storeScopedPath(storeId, '/anomalies') : legacyPath('/anomalies'), {}, 'anomalies');
}

export async function apiFetchActions(storeId?: string) {
  return fetchJson(storeId ? storeScopedPath(storeId, '/actions') : legacyPath('/actions'), {}, 'actions');
}

export async function apiFetchContext(storeId?: string) {
  return fetchJson(storeId ? storeScopedPath(storeId, '/context') : legacyPath('/context'), {}, 'context');
}

export async function apiUpdateActionStatus(id: string, status: string, storeId?: string): Promise<ActionStatusUpdateEnvelope> {
  return fetchJson(
    storeId ? storeScopedPath(storeId, `/actions/${encodeURIComponent(id)}/status`) : legacyPath(`/actions/${encodeURIComponent(id)}/status`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
    `update ${id}`,
  );
}

export async function apiFetchPipelineMeta(storeId?: string) {
  return fetchJson(storeId ? storeScopedPath(storeId, '/pipeline-meta') : legacyPath('/pipeline-meta'), {}, 'pipeline-meta');
}
