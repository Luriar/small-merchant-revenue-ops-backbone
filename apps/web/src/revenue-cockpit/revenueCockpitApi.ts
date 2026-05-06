import { getStoredAuthSession } from './revenueCockpitAuth';

const DEFAULT_API_ORIGIN = 'https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com';
const API_PATH = '/api/v1/revenue';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const configuredOrigin = env?.VITE_REVENUE_API_BASE_URL?.replace(/\/+$/, '');
const BASE = `${configuredOrigin || DEFAULT_API_ORIGIN}${API_PATH}`;

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

async function fetchJson(path: string, init: RequestInit = {}, label = path) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: withAuthHeaders(init.headers),
  });

  if (!res.ok) {
    throw new Error(`${label} ${res.status}`);
  }

  return res.json();
}

export async function apiFetchBriefs() {
  return fetchJson('/briefs', {}, 'briefs');
}

export async function apiFetchAnomalies() {
  return fetchJson('/anomalies', {}, 'anomalies');
}

export async function apiFetchActions() {
  return fetchJson('/actions', {}, 'actions');
}

export async function apiFetchContext() {
  return fetchJson('/context', {}, 'context');
}

export async function apiUpdateActionStatus(id: string, status: string): Promise<ActionStatusUpdateEnvelope> {
  return fetchJson(
    `/actions/${id}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
    `update ${id}`,
  );
}

export async function apiFetchPipelineMeta() {
  return fetchJson('/pipeline-meta', {}, 'pipeline-meta');
}
