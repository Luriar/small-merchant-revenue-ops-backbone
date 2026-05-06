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


export async function apiFetchBriefs() {
  const res = await fetch(`${BASE}/briefs`);
  if (!res.ok) throw new Error(`briefs ${res.status}`);
  return res.json();
}

export async function apiFetchAnomalies() {
  const res = await fetch(`${BASE}/anomalies`);
  if (!res.ok) throw new Error(`anomalies ${res.status}`);
  return res.json();
}

export async function apiFetchActions() {
  const res = await fetch(`${BASE}/actions`);
  if (!res.ok) throw new Error(`actions ${res.status}`);
  return res.json();
}

export async function apiFetchContext() {
  const res = await fetch(`${BASE}/context`);
  if (!res.ok) throw new Error(`context ${res.status}`);
  return res.json();
}

export async function apiUpdateActionStatus(id: string, status: string): Promise<ActionStatusUpdateEnvelope> {
  const res = await fetch(`${BASE}/actions/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`update ${id} ${res.status}`);
  return res.json();
}

export async function apiFetchPipelineMeta() {
  const res = await fetch(`${BASE}/pipeline-meta`);
  if (!res.ok) throw new Error(`pipeline-meta ${res.status}`);
  return res.json();
}
