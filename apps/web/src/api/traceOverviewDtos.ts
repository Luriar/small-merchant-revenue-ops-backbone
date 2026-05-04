// Frontend DTO types for the M1 Aurora-backed API read path.
// UI normalization still belongs in view-models/traceOverviewViewModel.ts.

export type IsoDateTimeString = string;
export type Cursor = string | null;

export type TraceStatusDto = "suspected";
export type ConfidenceDto = "strong" | "medium" | "weak";
export type ChangeTypeDto = "release" | "flag" | "rule";
export type RunStatusDto = "pending" | "processing" | "completed" | "failed" | "dlq";
export type IssueStatusDto = "open" | "investigating" | "resolved" | "ignored";
export type EvidenceTypeDto = "timing" | "variation" | "event_spike" | "rule_match";
export type AnomalyTypeDto = "volume" | "error" | "retry" | "cohort";

export interface PageDto {
  limit?: number | null;
  has_more?: boolean;
  next_cursor?: Cursor;
}

export interface DashboardOverviewResponse {
  scope?: {
    service?: string;
    from?: IsoDateTimeString;
    to?: IsoDateTimeString;
  };
  kpis?: {
    changes?: number;
    detected_anomaly_patterns?: number;
    linked_issues?: number;
    suspected_traces?: number;
  };
  chart_context?: {
    metric?: string;
    baseline_window?: string;
    compare_window?: string;
    granularity?: string;
  };
}

export interface DashboardTimelineResponse {
  metric?: string;
  series?: TimelineSeriesPointDto[];
  change_markers?: ChangeMarkerDto[];
  anomaly_markers?: AnomalyMarkerDto[];
}

export interface TimelineSeriesPointDto {
  ts?: IsoDateTimeString;
  value?: number;
}

export interface ChangeMarkerDto {
  change_id?: string;
  title?: string;
  occurred_at?: IsoDateTimeString;
}

export interface AnomalyMarkerDto {
  detection_id?: string;
  ts?: IsoDateTimeString;
  label?: string;
}

export interface TraceListResponse {
  items?: TraceListItem[];
  page?: PageDto;
}

export interface TraceListItem {
  trace_id?: string;
  change_id?: string | null;
  primary_issue_id?: string | null;
  status?: TraceStatusDto;
  confidence?: ConfidenceDto;
  anomaly_type?: AnomalyTypeDto;
  anomaly_metric?: string;
  anomaly_window_start?: IsoDateTimeString;
  anomaly_window_end?: IsoDateTimeString;
  evidence_count?: number;
  created_at?: IsoDateTimeString;
}

export interface TraceDetailResponse {
  trace_id?: string;
  change_id?: string | null;
  primary_issue_id?: string | null;
  status?: TraceStatusDto;
  confidence?: ConfidenceDto;
  anomaly_type?: AnomalyTypeDto;
  anomaly_metric?: string;
  anomaly_window_start?: IsoDateTimeString;
  anomaly_window_end?: IsoDateTimeString;
  evidence_count?: number;
  created_at?: IsoDateTimeString;
}

export interface EvidenceListResponse {
  items?: EvidenceItem[];
}

export interface EvidenceItem {
  evidence_id?: string;
  trace_id?: string;
  evidence_type?: EvidenceTypeDto;
  strength?: ConfidenceDto;
  summary?: string;
  source_ref?: string | null;
}

export interface ChangeListResponse {
  items?: ChangeListItem[];
  page?: PageDto;
}

export interface ChangeListItem {
  change_id?: string;
  change_type?: ChangeTypeDto;
  title?: string;
  target_service?: string;
  source?: string;
  occurred_at?: IsoDateTimeString;
  created_at?: IsoDateTimeString;
}

export interface ChangeDetail {
  change_id?: string;
  change_type?: ChangeTypeDto;
  title?: string;
  target_service?: string;
  source?: string;
  occurred_at?: IsoDateTimeString;
  created_at?: IsoDateTimeString;
  actor_present?: boolean;
  rule_scope_present?: boolean;
}

export interface IssueListResponse {
  items?: IssueListItem[];
  page?: PageDto;
}

export interface IssueListItem {
  issue_id?: string;
  issue_family?: string;
  severity?: number;
  status?: IssueStatusDto;
  summary?: string;
  source?: string;
  external_id_present?: boolean;
  created_at?: IsoDateTimeString;
}

export interface IssueDetail {
  issue_id?: string;
  issue_family?: string;
  severity?: number;
  status?: IssueStatusDto;
  summary?: string;
  source?: string;
  external_id_present?: boolean;
  created_at?: IsoDateTimeString;
  reporter_present?: boolean;
  affected_variation_present?: boolean;
  keywords_count?: number;
  body_present?: boolean;
}

export type IssueDetailNullableResponse = IssueDetail | null;

export interface RunOverviewResponse {
  kpis?: {
    pending?: number;
    processing?: number;
    failed?: number;
    dlq?: number;
  };
  distribution?: RunDistributionItem[];
}

export interface RunDistributionItem {
  status?: RunStatusDto;
  count?: number;
}

export interface RunFailureGroupsResponse {
  groups?: RunFailureGroup[];
}

export interface RunFailureGroup {
  error_class?: string;
  count?: number;
  latest_occurred_at?: IsoDateTimeString;
  representative_run_type?: string;
  retryable?: boolean;
}

export interface RunListResponse {
  items?: RunDetail[];
  runs?: RunDetail[];
  page?: PageDto;
}

export interface RunDetail {
  run_id?: string;
  run_type?: string;
  target_kind?: string;
  target_ref?: string | null;
  status?: RunStatusDto;
  attempt?: number;
  created_at?: IsoDateTimeString;
  retry_action?: string;
  original_run_id?: string;
}

export interface RunStateLogResponse {
  items?: RunStateLogItem[];
}

export interface RunStateLogItem {
  state_log_id?: number | string;
  run_id?: string;
  from_status?: RunStatusDto | null;
  to_status?: RunStatusDto;
  changed_at?: IsoDateTimeString;
}

export interface RetryRunRequest {
  idempotency_key: string;
  reason: string;
}

export interface RetryRunResponse {
  action?: "retry_requested";
  original_run_id?: string;
  new_run_id?: string;
  idempotent_replay?: boolean;
}

export type ReprocessTargetKindDto = "dlq_batch" | "event_batch";

export interface ReprocessRunRequest {
  idempotency_key: string;
  target_kind: ReprocessTargetKindDto;
  target_ref: string;
  reason: string;
}

export interface ReprocessRunResponse {
  action?: "reprocess_requested";
  new_run_id?: string;
  idempotent_replay?: boolean;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}
