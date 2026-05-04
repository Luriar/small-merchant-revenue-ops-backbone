import type {
  ChangeDetail,
  ChangeListResponse,
  DashboardOverviewResponse,
  DashboardTimelineResponse,
  ErrorResponse,
  EvidenceListResponse,
  IssueDetail,
  IssueDetailNullableResponse,
  IssueListResponse,
  ReprocessRunRequest,
  ReprocessRunResponse,
  RetryRunRequest,
  RetryRunResponse,
  RunDetail,
  RunFailureGroupsResponse,
  RunListResponse,
  RunOverviewResponse,
  RunStateLogResponse,
  TraceDetailResponse,
  TraceListResponse
} from "./traceOverviewDtos";
import {
  DEFAULT_DASHBOARD_TIMELINE_METRIC,
  changeDetailPath,
  changesPath,
  changeTracesPath,
  dashboardOverviewPath,
  dashboardTimelinePath,
  issueDetailPath,
  issuesPath,
  issueTracesPath,
  runDetailPath,
  runListPath,
  reprocessPath,
  retryRunPath,
  runsFailuresPath,
  runsOverviewPath,
  runStateLogPath,
  traceDetailPath,
  traceEvidencesPath,
  tracesPath,
  tracePrimaryIssuePath
} from "./traceOverviewPaths";

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export class TraceOverviewApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(params: { status: number; code: string; message: string; details?: unknown }) {
    super(params.message);
    this.name = "TraceOverviewApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
  }
}

export function fetchDashboardOverview(): Promise<DashboardOverviewResponse> {
  return requestJson(dashboardOverviewPath());
}

export function fetchDashboardTimeline(
  metric = DEFAULT_DASHBOARD_TIMELINE_METRIC,
  params: QueryParams = {}
): Promise<DashboardTimelineResponse> {
  return requestJson(dashboardTimelinePath(metric, params));
}

export function fetchTraces(params: QueryParams = {}): Promise<TraceListResponse> {
  return requestJson(tracesPath(params));
}

export function fetchTraceDetail(traceId: string): Promise<TraceDetailResponse> {
  return requestJson(traceDetailPath(traceId));
}

export function fetchTraceEvidences(traceId: string): Promise<EvidenceListResponse> {
  return requestJson(traceEvidencesPath(traceId));
}

export function fetchTracePrimaryIssue(traceId: string): Promise<IssueDetailNullableResponse> {
  return requestJson(tracePrimaryIssuePath(traceId));
}

export function fetchChanges(params: QueryParams = {}): Promise<ChangeListResponse> {
  return requestJson(changesPath(params));
}

export function fetchChangeDetail(changeId: string): Promise<ChangeDetail> {
  return requestJson(changeDetailPath(changeId));
}

export function fetchChangeTraces(changeId: string): Promise<TraceListResponse> {
  return requestJson(changeTracesPath(changeId));
}

export function fetchRunsOverview(): Promise<RunOverviewResponse> {
  return requestJson(runsOverviewPath());
}

export function fetchRunsFailures(): Promise<RunFailureGroupsResponse> {
  return requestJson(runsFailuresPath());
}

export function fetchRuns(params: QueryParams = {}): Promise<RunListResponse> {
  return requestJson(runListPath(params));
}

export function fetchRunDetail(runId: string): Promise<RunDetail> {
  return requestJson(runDetailPath(runId));
}

export function fetchRunStateLog(runId: string): Promise<RunStateLogResponse> {
  return requestJson(runStateLogPath(runId));
}

export function retryRun(runId: string, body: RetryRunRequest): Promise<RetryRunResponse> {
  return postJson(retryRunPath(runId), body);
}

export function reprocessRun(body: ReprocessRunRequest): Promise<ReprocessRunResponse> {
  return postJson(reprocessPath(), body);
}

export function fetchIssues(params: QueryParams = {}): Promise<IssueListResponse> {
  return requestJson(issuesPath(params));
}

export function fetchIssueDetail(issueId: string): Promise<IssueDetail> {
  return requestJson(issueDetailPath(issueId));
}

export function fetchIssueTraces(issueId: string): Promise<TraceListResponse> {
  return requestJson(issueTracesPath(issueId));
}

async function requestJson<TResponse>(path: string): Promise<TResponse> {
  assertRelativeApiPath(path);

  const response = await fetch(path, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  return body as TResponse;
}

async function postJson<TResponse, TBody extends object>(
  path: string,
  requestBody: TBody
): Promise<TResponse> {
  assertRelativeApiPath(path);

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  return body as TResponse;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(status: number, body: unknown): TraceOverviewApiError {
  const errorBody = parseErrorResponse(body);

  return new TraceOverviewApiError({
    status,
    code: errorBody?.code ?? "http_error",
    message: errorBody?.message ?? `TraceOps API request failed with status ${status}`,
    details: errorBody?.details
  });
}

function parseErrorResponse(body: unknown): ErrorResponse | null {
  if (isErrorResponse(body)) {
    return body;
  }

  if (isRecord(body) && isErrorResponse(body.error)) {
    return body.error;
  }

  return null;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    isRecord(value)
    && typeof value.code === "string"
    && typeof value.message === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRelativeApiPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) {
    throw new RangeError("TraceOps API path must be relative");
  }
}
