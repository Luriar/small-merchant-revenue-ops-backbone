import type {
  ChangeDetail,
  ChangeListResponse,
  DashboardOverviewResponse,
  DashboardTimelineResponse,
  EvidenceListResponse,
  IssueDetail,
  IssueDetailNullableResponse,
  IssueListResponse,
  RunDetail,
  RunFailureGroupsResponse,
  RunListResponse,
  RunOverviewResponse,
  RunStateLogResponse,
  TraceDetailResponse,
  TraceListResponse
} from "./traceOverviewDtos";

export interface TraceOverviewApiBundle {
  dashboardOverview: DashboardOverviewResponse;
  dashboardTimeline: DashboardTimelineResponse;
  traces: TraceListResponse;
  selectedTrace: TraceDetailResponse | null;
  selectedTraceEvidences: EvidenceListResponse | null;
  selectedTracePrimaryIssue: IssueDetailNullableResponse;
  selectedTraceChange: ChangeDetail | null;
}

export interface ChangeTimelineApiBundle {
  changes: ChangeListResponse;
  selectedChange: ChangeDetail | null;
  selectedChangeTraces: TraceListResponse | null;
}

export interface LinkedIssueApiBundle {
  issues: IssueListResponse;
  selectedIssue: IssueDetail | null;
  selectedIssueTraces: TraceListResponse | null;
}

export interface ReliabilityApiBundle {
  runsOverview: RunOverviewResponse;
  runsFailures: RunFailureGroupsResponse;
  runs: RunListResponse;
  selectedRun: RunDetail | null;
  selectedRunStateLog: RunStateLogResponse | null;
}
