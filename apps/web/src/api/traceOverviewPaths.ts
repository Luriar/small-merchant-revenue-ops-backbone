// Relative TraceOps read-path endpoint builders.
// This module is a compile-time contract utility only; it is not a fetch client.

const API_PREFIX = "/api/v1";
export const DEFAULT_DASHBOARD_TIMELINE_METRIC = "checkout.error_rate";

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

function encodeRequiredPathParam(value: string, paramName: string): string {
  if (value.trim().length === 0) {
    throw new RangeError(`${paramName} is required`);
  }

  return encodeURIComponent(value);
}

export function dashboardOverviewPath(): string {
  return `${API_PREFIX}/dashboard/overview`;
}

export function dashboardTimelinePath(
  metric = DEFAULT_DASHBOARD_TIMELINE_METRIC,
  params: QueryParams = {}
): string {
  const trimmedMetric = metric.trim();

  if (trimmedMetric.length === 0) {
    throw new RangeError("metric is required");
  }

  return appendQuery(`${API_PREFIX}/dashboard/timeline`, {
    metric: trimmedMetric,
    ...params
  });
}

export function tracesPath(params: QueryParams = {}): string {
  return appendQuery(`${API_PREFIX}/traces`, params);
}

export function traceDetailPath(traceId: string): string {
  return `${API_PREFIX}/traces/${encodeRequiredPathParam(traceId, "traceId")}`;
}

export function traceEvidencesPath(traceId: string): string {
  return `${traceDetailPath(traceId)}/evidences`;
}

export function tracePrimaryIssuePath(traceId: string): string {
  return `${traceDetailPath(traceId)}/primary-issue`;
}

export function changesPath(params: QueryParams = {}): string {
  return appendQuery(`${API_PREFIX}/changes`, params);
}

export function changeDetailPath(changeId: string): string {
  return `${API_PREFIX}/changes/${encodeRequiredPathParam(changeId, "changeId")}`;
}

export function changeTracesPath(changeId: string): string {
  return `${changeDetailPath(changeId)}/traces`;
}

export function runsOverviewPath(): string {
  return `${API_PREFIX}/runs/overview`;
}

export function runsFailuresPath(): string {
  return `${API_PREFIX}/runs/failures`;
}

export function runListPath(params: QueryParams = {}): string {
  return appendQuery(`${API_PREFIX}/runs`, params);
}

export function runDetailPath(runId: string): string {
  return `${API_PREFIX}/runs/${encodeRequiredPathParam(runId, "runId")}`;
}

export function runStateLogPath(runId: string): string {
  return `${runDetailPath(runId)}/state-log`;
}

export function retryRunPath(runId: string): string {
  return `${runDetailPath(runId)}/retry`;
}

export function reprocessPath(): string {
  return `${API_PREFIX}/reprocess`;
}

export function issuesPath(params: QueryParams = {}): string {
  return appendQuery(`${API_PREFIX}/issues`, params);
}

export function issueDetailPath(issueId: string): string {
  return `${API_PREFIX}/issues/${encodeRequiredPathParam(issueId, "issueId")}`;
}

export function issueTracesPath(issueId: string): string {
  return `${issueDetailPath(issueId)}/traces`;
}

function appendQuery(path: string, params: QueryParams): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
