import type {
  ChangeDetail,
  ChangeListResponse,
  ConfidenceDto,
  DashboardOverviewResponse,
  DashboardTimelineResponse,
  EvidenceItem,
  EvidenceListResponse,
  EvidenceTypeDto,
  IssueDetailNullableResponse,
  RunFailureGroupsResponse,
  RunOverviewResponse,
  TraceDetailResponse,
  TraceListItem,
  TraceListResponse
} from "./traceOverviewDtos";
import type {
  ContextMetric,
  EvidenceFactor,
  EvidenceStrength,
  EvidenceType,
  ReviewCase,
  ReviewRiskLevel,
  ReviewStatus,
  TraceLinkChange,
  TraceLinkIssue,
  TraceLinkRecommendedStep,
  TraceLinkReasoningItem,
  TraceLinkSummary,
  TraceScenario,
  TraceStage,
  TraceStageId
} from "../types/trace";
import type { TraceOverviewApiBundle } from "./traceOverviewBundles";

export interface TraceOverviewDtoBundle {
  dashboardOverview?: DashboardOverviewResponse;
  dashboardTimeline?: DashboardTimelineResponse;
  traces?: TraceListResponse;
  selectedTrace?: TraceDetailResponse | null;
  evidences?: EvidenceListResponse;
  primaryIssue?: IssueDetailNullableResponse;
  changes?: ChangeListResponse;
  relatedChange?: ChangeDetail | null;
  runOverview?: RunOverviewResponse;
  runFailures?: RunFailureGroupsResponse;
  selectedTraceId?: string | null;
}

export interface TraceOverviewViewModelInput {
  defaultTraceId: string;
  reviewCases: ReviewCase[];
  selectedTraceId: string | null;
  traceScenarios: Record<string, TraceScenario>;
}

const UNKNOWN_VALUE = "Unknown";
const NOT_AVAILABLE = "n/a";

const evidenceStageMap: Record<EvidenceType, TraceStageId[]> = {
  timing: ["product-change", "signal-anomaly"],
  variation: ["product-change", "signal-anomaly", "linked-issue-cluster"],
  event_spike: ["signal-anomaly", "linked-issue-cluster", "evidence-strength"],
  issue_family: ["linked-issue-cluster", "evidence-strength"],
  baseline_absence: ["signal-anomaly", "evidence-strength"],
  metric_deviation: ["signal-anomaly", "evidence-strength"],
  log_correlation: ["signal-anomaly", "evidence-strength"],
  support_ticket_pattern: ["linked-issue-cluster", "evidence-strength"]
};

function toArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function firstPresent(...values: Array<string | null | undefined>): string {
  return values.find((value): value is string => Boolean(value)) ?? UNKNOWN_VALUE;
}

function firstOptional(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value));
}

function formatCount(value: number | undefined, fallback = "0"): string {
  return typeof value === "number" ? String(value) : fallback;
}

function formatShortCount(value: number | undefined, fallback = NOT_AVAILABLE): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value >= 1_000_000) {
    return `${formatCompactDecimal(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `${formatCompactDecimal(value / 1_000)}K`;
  }

  return String(value);
}

function formatCompactDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatTime(value: string | null | undefined, fallback = UNKNOWN_VALUE): string {
  const date = parseDate(value);

  if (!date) {
    return fallback;
  }

  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";

  return `${hour12}:${minutes} ${suffix}`;
}

function formatRelativeOffset(
  baseTimestamp: string | null | undefined,
  targetTimestamp: string | null | undefined,
  fallback = UNKNOWN_VALUE
): string {
  const baseDate = parseDate(baseTimestamp);
  const targetDate = parseDate(targetTimestamp);

  if (!baseDate || !targetDate) {
    return fallback;
  }

  const minutes = Math.round((targetDate.getTime() - baseDate.getTime()) / 60_000);

  if (minutes === 0) {
    return "+0m";
  }

  return minutes > 0 ? `+${minutes}m` : `${minutes}m`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toEvidenceTypeLabel(type: EvidenceTypeDto | undefined): string {
  if (type === "timing") {
    return "Timing";
  }

  if (type === "variation") {
    return "Variation";
  }

  if (type === "event_spike") {
    return "Event spike";
  }

  if (type === "rule_match") {
    return "Rule match";
  }

  return "Evidence";
}

function toEvidenceFactorLabel(type: EvidenceTypeDto | undefined): string {
  if (type === "rule_match") {
    return "Rule match";
  }

  return type ? `${toEvidenceTypeLabel(type)} match` : "Evidence match";
}

function formatEvidenceTypes(items: EvidenceItem[]): string {
  const labels = [...new Set(items.map((item) => toEvidenceTypeLabel(item.evidence_type)))];

  return labels.length > 0 ? labels.join(" / ") : "None";
}

function formatBaseline(): string {
  return UNKNOWN_VALUE;
}

function formatTraceSummary(trace: TraceListItem | TraceDetailResponse | null | undefined): string {
  const metric = trace?.anomaly_metric;
  const type = trace?.anomaly_type;

  if (metric && type) {
    return `${type} anomaly on ${metric}`;
  }

  return firstPresent(metric, type, "Suspected trace");
}

function toRiskLevel(confidence: ConfidenceDto | undefined): ReviewRiskLevel {
  if (confidence === "strong") {
    return "high";
  }

  if (confidence === "medium") {
    return "medium";
  }

  return "low";
}

function toConfidencePercent(confidence: ConfidenceDto | undefined): number {
  if (confidence === "strong") {
    return 88;
  }

  if (confidence === "medium") {
    return 62;
  }

  return 45;
}

function toReviewStatus(status: string | undefined): ReviewStatus {
  return status === "investigating" ? "investigating" : "open";
}

function toEvidenceType(type: EvidenceTypeDto | undefined): EvidenceType {
  if (type === "timing" || type === "variation" || type === "event_spike") {
    return type;
  }

  if (type === "rule_match") {
    // TODO: Add a distinct UI rail bucket when rule-match evidence is promoted
    // from API contract support into the visual evidence model.
    return "issue_family";
  }

  return "issue_family";
}

function toEvidenceStrength(confidence: ConfidenceDto | undefined): EvidenceStrength {
  return confidence ?? "weak";
}

function buildReviewCase(params: {
  trace: TraceListItem;
  detail: TraceDetailResponse | null;
  issue: IssueDetailNullableResponse;
  relatedChange: ChangeDetail | null;
}): ReviewCase {
  const traceId = firstPresent(params.trace.trace_id, params.detail?.trace_id);
  const issueId = firstPresent(
    params.issue?.issue_id,
    params.detail?.primary_issue_id,
    params.trace.primary_issue_id,
    traceId
  );
  const issueFamily = firstPresent(
    params.issue?.issue_family,
    "Unclassified"
  );
  const confidence = params.trace.confidence ?? params.detail?.confidence;
  const changeTitle = firstPresent(
    params.relatedChange?.title,
    "Unlinked change"
  );
  const affectedUsers = formatShortCount(undefined);

  return {
    id: traceId,
    incidentId: issueId,
    riskLevel: toRiskLevel(confidence),
    title: firstPresent(params.issue?.summary, formatTraceSummary(params.trace)),
    service: firstPresent(params.relatedChange?.target_service),
    linkedChangeTitle: changeTitle,
    confidence: toConfidencePercent(confidence),
    affectedUsers,
    firstSeenAt: formatTime(firstOptional(params.detail?.anomaly_window_start, params.trace.anomaly_window_start, params.trace.created_at), NOT_AVAILABLE),
    status: toReviewStatus(params.issue?.status),
    issueFamily,
    primaryActionLabel: "Review evidence"
  };
}

function buildStages(params: {
  reviewCase: ReviewCase;
  detail: TraceDetailResponse | null;
  relatedChange: ChangeDetail | null;
  evidenceCount: number;
  evidenceItems: EvidenceItem[];
  dashboardTimeline: DashboardTimelineResponse | undefined;
  traceCreatedAt: string | undefined;
}): TraceStage[] {
  const changeTitle = firstPresent(
    params.relatedChange?.title,
    params.reviewCase.linkedChangeTitle
  );
  const service = firstPresent(
    params.relatedChange?.target_service,
    params.reviewCase.service
  );
  const changeOccurredAt = firstOptional(
    params.relatedChange?.occurred_at,
    toArray(params.dashboardTimeline?.change_markers)[0]?.occurred_at
  );
  const anomalyStartAt = firstOptional(params.detail?.anomaly_window_start, params.traceCreatedAt);
  const anomalyEndAt = firstOptional(params.detail?.anomaly_window_end, anomalyStartAt);
  const traceCreatedAt = firstOptional(params.traceCreatedAt, anomalyEndAt);
  const deployedAt = formatTime(changeOccurredAt, params.reviewCase.firstSeenAt);
  const anomalyOffset = formatRelativeOffset(changeOccurredAt, anomalyStartAt, params.reviewCase.firstSeenAt);
  const issueOffset = formatRelativeOffset(changeOccurredAt, traceCreatedAt, "Now");
  const evidenceOffset = formatRelativeOffset(changeOccurredAt, anomalyEndAt, issueOffset);
  const windowValue =
    changeOccurredAt && anomalyStartAt
      ? formatRelativeOffset(changeOccurredAt, anomalyStartAt, formatTime(anomalyStartAt, NOT_AVAILABLE))
      : formatTime(anomalyStartAt, NOT_AVAILABLE);
  const changeType = firstPresent(params.relatedChange?.change_type, UNKNOWN_VALUE);
  const anomalySummary = firstPresent(params.detail?.anomaly_metric, params.reviewCase.title);
  const evidenceTypes = formatEvidenceTypes(params.evidenceItems);
  const baseline = formatBaseline();

  return [
    {
      id: "product-change",
      order: 1,
      icon: "C",
      title: "Product Change",
      subtitle: changeTitle,
      timeDeltaFromPrevious: deployedAt,
      metaRows: [
        { label: "Service", value: service },
        { label: "Deployed", value: deployedAt },
        { label: "Type", value: changeType }
      ]
    },
    {
      id: "signal-anomaly",
      order: 2,
      icon: "S",
      title: "Signal / Anomaly",
      subtitle: anomalySummary,
      timeDeltaFromPrevious: anomalyOffset,
      metaRows: [
        { label: "Window", value: windowValue },
        { label: "Confidence", value: `${params.reviewCase.confidence}%` },
        { label: "Affected", value: params.reviewCase.affectedUsers }
      ]
    },
    {
      id: "linked-issue-cluster",
      order: 3,
      icon: "I",
      title: "Linked Issue",
      subtitle: params.reviewCase.incidentId,
      timeDeltaFromPrevious: issueOffset,
      metaRows: [
        { label: "Family", value: params.reviewCase.issueFamily },
        { label: "Service", value: service },
        { label: "Status", value: params.reviewCase.status }
      ]
    },
    {
      id: "evidence-strength",
      order: 4,
      icon: "E",
      title: "Evidence Strength",
      subtitle: `${params.evidenceCount} evidence factors`,
      timeDeltaFromPrevious: evidenceOffset,
      metaRows: [
        { label: "Types", value: evidenceTypes },
        { label: "Baseline", value: baseline },
        { label: "Count", value: `${params.evidenceCount} factors` }
      ]
    },
    {
      id: "recommended-follow-up",
      order: 5,
      icon: "F",
      title: "Recommended Follow-up",
      subtitle: "Next best steps",
      timeDeltaFromPrevious: "Now",
      metaRows: [
        { label: "Primary", value: "Review evidence" },
        { label: "Secondary", value: "Open issue" },
        { label: "Handoff", value: "Create handoff" }
      ]
    }
  ];
}

function buildEvidenceFactor(item: EvidenceItem): EvidenceFactor {
  const evidenceType = toEvidenceType(item.evidence_type);

  return {
    id: evidenceType,
    label: toEvidenceFactorLabel(item.evidence_type),
    strength: toEvidenceStrength(item.strength),
    description: firstPresent(item.summary, "Evidence summary unavailable"),
    relatedStages: evidenceStageMap[evidenceType],
    sourceRef: shortenSourceRef(item.source_ref),
    evidenceIdShort: shortenId(item.evidence_id)
  };
}

function shortenId(id: string | null | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  if (id.length <= 16) {
    return id;
  }

  return `${id.slice(0, 8)}…`;
}

function shortenIdOrFallback(id: string | null | undefined, fallback = NOT_AVAILABLE): string {
  return shortenId(id) ?? fallback;
}

function shortenSourceRef(sourceRef: string | null | undefined): string | undefined {
  if (!sourceRef) {
    return undefined;
  }

  if (sourceRef.length <= 24) {
    return sourceRef;
  }

  return `${sourceRef.slice(0, 20)}…`;
}

function computeMinutesDiff(
  fromTimestamp: string | null | undefined,
  toTimestamp: string | null | undefined
): number | null {
  const fromDate = parseDate(fromTimestamp);
  const toDate = parseDate(toTimestamp);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.round((toDate.getTime() - fromDate.getTime()) / 60_000);
}

function formatMinutesPhrase(minutes: number): string {
  if (minutes === 0) {
    return "in the same minute as";
  }

  const abs = Math.abs(minutes);
  const direction = minutes > 0 ? "after" : "before";

  return `${abs} min ${direction}`;
}

function formatAnomalyWindow(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = formatTime(start, NOT_AVAILABLE);
  const endLabel = formatTime(end, NOT_AVAILABLE);

  if (startLabel === NOT_AVAILABLE && endLabel === NOT_AVAILABLE) {
    return NOT_AVAILABLE;
  }

  if (startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} – ${endLabel}`;
}

function toConfidenceLabel(tier: EvidenceStrength): string {
  if (tier === "strong") {
    return "Strong";
  }

  if (tier === "medium") {
    return "Medium";
  }

  return "Weak";
}

function countEvidenceStrengths(factors: EvidenceFactor[]): Record<EvidenceStrength, number> {
  return factors.reduce(
    (acc, factor) => {
      acc[factor.strength] += 1;
      return acc;
    },
    { strong: 0, medium: 0, weak: 0 }
  );
}

function summarizeEvidenceMix(counts: Record<EvidenceStrength, number>): string {
  return `${counts.strong} strong / ${counts.medium} medium / ${counts.weak} weak`;
}

function buildTraceLinkSummary(params: {
  detail: TraceDetailResponse | null;
  change: ChangeDetail | null;
  issue: IssueDetailNullableResponse;
  evidenceFactors: EvidenceFactor[];
}): TraceLinkSummary | null {
  const detail = params.detail;

  if (!detail || !detail.trace_id) {
    return null;
  }

  const tier: EvidenceStrength = detail.confidence ?? "weak";
  const confidence = toConfidencePercent(detail.confidence);
  const confidenceLabel = toConfidenceLabel(tier);
  const evidenceMixCounts = countEvidenceStrengths(params.evidenceFactors);
  const evidenceMixSummary = summarizeEvidenceMix(evidenceMixCounts);

  const change: TraceLinkChange | null = params.change
    ? {
        id: params.change.change_id ?? "",
        idShort: shortenIdOrFallback(params.change.change_id),
        title: firstPresent(params.change.title, "Untitled change"),
        type: firstPresent(params.change.change_type, UNKNOWN_VALUE),
        targetService: firstPresent(params.change.target_service, UNKNOWN_VALUE),
        source: firstPresent(params.change.source, UNKNOWN_VALUE),
        occurredAt: formatTime(params.change.occurred_at, NOT_AVAILABLE)
      }
    : null;

  const issue: TraceLinkIssue | null = params.issue
    ? {
        id: params.issue.issue_id ?? "",
        idShort: shortenIdOrFallback(params.issue.issue_id),
        summary: firstPresent(params.issue.summary, "Issue summary unavailable"),
        family: firstPresent(params.issue.issue_family, "Unclassified"),
        status: firstPresent(params.issue.status, UNKNOWN_VALUE),
        source: firstPresent(params.issue.source, UNKNOWN_VALUE),
        severity:
          typeof params.issue.severity === "number" ? String(params.issue.severity) : NOT_AVAILABLE
      }
    : null;

  const reasoning: TraceLinkReasoningItem[] = [];

  const anomalyMinutes = computeMinutesDiff(
    params.change?.occurred_at,
    detail.anomaly_window_start
  );
  if (anomalyMinutes !== null) {
    const anomalyTimingBodyKey =
      anomalyMinutes === 0
        ? "traceReasonAnomalySameMinute"
        : anomalyMinutes > 0
          ? "traceReasonAnomalyAfter"
          : "traceReasonAnomalyBefore";

    reasoning.push({
      id: "anomaly-timing",
      labelKey: "anomalyTiming",
      body: `Anomaly window starts ${formatMinutesPhrase(anomalyMinutes)} the change.`,
      bodyKey: anomalyTimingBodyKey,
      bodyParams: { minutes: Math.abs(anomalyMinutes) }
    });
  }

  if (params.change?.target_service) {
    reasoning.push({
      id: "service-scope",
      labelKey: "serviceScope",
      body: `Change targets service: ${params.change.target_service}.`,
      bodyKey: "traceReasonServiceScope",
      bodyParams: { service: params.change.target_service }
    });
  }

  if (params.issue?.issue_family) {
    reasoning.push({
      id: "issue-family",
      labelKey: "issueFamily",
      body: `Reported issue clusters under: ${params.issue.issue_family}.`,
      bodyKey: "traceReasonIssueFamily",
      bodyParams: { issueFamily: params.issue.issue_family }
    });
  }

  if (params.evidenceFactors.length > 0) {
    reasoning.push({
      id: "evidence-support",
      labelKey: "evidenceSupport",
      body: `${params.evidenceFactors.length} factor(s) — ${evidenceMixSummary}.`,
      bodyKey: "traceReasonEvidenceSupport",
      bodyParams: {
        count: params.evidenceFactors.length,
        strong: evidenceMixCounts.strong,
        medium: evidenceMixCounts.medium,
        weak: evidenceMixCounts.weak
      }
    });
  }

  if (detail.anomaly_type && detail.anomaly_metric) {
    reasoning.push({
      id: "anomaly-fingerprint",
      labelKey: "anomalyFingerprint",
      body: `${detail.anomaly_type} anomaly on ${detail.anomaly_metric}.`,
      bodyKey: "traceReasonAnomalyFingerprint",
      bodyParams: {
        anomalyType: detail.anomaly_type,
        metric: detail.anomaly_metric
      }
    });
  }

  const recommendedSteps: TraceLinkRecommendedStep[] = [];

  if (issue) {
    recommendedSteps.push({
      id: "review-issue",
      labelKey: "reviewLinkedIssueLabel",
      body: `${issue.idShort} · ${issue.summary} (status: ${issue.status})`,
      bodyKey: "traceStepReviewIssue",
      bodyParams: {
        issueId: issue.idShort,
        summary: issue.summary,
        status: issue.status
      }
    });
  }

  if (params.change?.occurred_at) {
    const deployedAt = formatTime(params.change.occurred_at, NOT_AVAILABLE);

    recommendedSteps.push({
      id: "inspect-release-timing",
      labelKey: "inspectReleaseTimingLabel",
      body: `Change deployed at ${deployedAt} on ${params.change.target_service ?? UNKNOWN_VALUE}.`,
      bodyKey: "traceStepInspectReleaseTiming",
      bodyParams: {
        time: deployedAt,
        service: params.change.target_service ?? UNKNOWN_VALUE
      }
    });
  }

  recommendedSteps.push({
    id: "check-runs",
    labelKey: "checkFailedRetryRunsLabel",
    body: "Open the Reliability panel to inspect related runs and DLQ pressure.",
    bodyKey: "traceStepCheckRuns"
  });

  return {
    trace: {
      id: detail.trace_id,
      idShort: shortenIdOrFallback(detail.trace_id),
      confidence,
      confidenceTier: tier,
      confidenceLabel,
      anomalyType: firstPresent(detail.anomaly_type, UNKNOWN_VALUE),
      anomalyMetric: firstPresent(detail.anomaly_metric, UNKNOWN_VALUE),
      anomalyWindow: formatAnomalyWindow(detail.anomaly_window_start, detail.anomaly_window_end),
      evidenceCount: params.evidenceFactors.length,
      evidenceMixCounts,
      evidenceMixSummary
    },
    change,
    issue,
    reasoning,
    recommendedSteps
  };
}

function buildTimeline(timeline: DashboardTimelineResponse | undefined): ContextMetric[] {
  const changeMarkers = toArray(timeline?.change_markers).map(
    (marker): ContextMetric => [formatTime(marker.occurred_at, NOT_AVAILABLE), firstPresent(marker.title)]
  );
  const anomalyMarkers = toArray(timeline?.anomaly_markers).map(
    (marker): ContextMetric => [formatTime(marker.ts, NOT_AVAILABLE), firstPresent(marker.label)]
  );

  return [...changeMarkers, ...anomalyMarkers];
}

function buildSignals(overview: DashboardOverviewResponse | undefined): ContextMetric[] {
  const kpis = overview?.kpis;
  const chart = overview?.chart_context;

  return [
    ["Changes", formatCount(kpis?.changes)],
    ["Linked issues", formatCount(kpis?.linked_issues)],
    ["Suspected traces", formatCount(kpis?.suspected_traces)],
    ["Metric", firstPresent(chart?.metric, NOT_AVAILABLE)]
  ];
}

function buildReliability(params: {
  runOverview?: RunOverviewResponse;
  runFailures?: RunFailureGroupsResponse;
}): ContextMetric[] {
  const kpis = params.runOverview?.kpis;
  const failureGroups = toArray(params.runFailures?.groups);

  return [
    ["Failed runs", formatCount(kpis?.failed)],
    ["DLQ pressure", formatCount(kpis?.dlq)],
    ["Failure groups", formatCount(failureGroups.length)]
  ];
}

export function mapTraceOverviewDtosToViewModelInput({
  dashboardOverview,
  dashboardTimeline,
  traces,
  selectedTrace,
  evidences,
  primaryIssue,
  changes,
  relatedChange,
  runOverview,
  runFailures,
  selectedTraceId
}: TraceOverviewDtoBundle): TraceOverviewViewModelInput {
  const traceItems = toArray(traces?.items);
  const resolvedSelectedTraceId =
    selectedTraceId ?? selectedTrace?.trace_id ?? traceItems[0]?.trace_id ?? null;
  const selectedDetail =
    selectedTrace && selectedTrace.trace_id === resolvedSelectedTraceId ? selectedTrace : null;
  const fallbackRelatedChange =
    relatedChange ?? toArray(changes?.items).find((change) => change.change_id === selectedDetail?.change_id) ?? null;
  const evidenceFactors = toArray(evidences?.items).map(buildEvidenceFactor);
  const traceScenarios = traceItems.reduce<Record<string, TraceScenario>>((scenarios, trace) => {
    const traceId = trace.trace_id;
    if (!traceId) {
      return scenarios;
    }

    const detail = traceId === selectedDetail?.trace_id ? selectedDetail : null;
    const reviewCase = buildReviewCase({
      trace,
      detail,
      issue: detail ? primaryIssue ?? null : null,
      relatedChange: detail ? fallbackRelatedChange : null
    });

    scenarios[traceId] = {
      reviewCase,
      stages: buildStages({
        reviewCase,
        detail,
        relatedChange: detail ? fallbackRelatedChange : null,
        evidenceCount: detail ? evidenceFactors.length : trace.evidence_count ?? 0,
        evidenceItems: detail ? toArray(evidences?.items) : [],
        dashboardTimeline,
        traceCreatedAt: trace.created_at
      }),
      evidenceFactors: detail ? evidenceFactors : [],
      timeline: detail ? buildTimeline(dashboardTimeline) : [],
      signals: detail ? buildSignals(dashboardOverview) : [],
      reliability: detail ? buildReliability({ runOverview, runFailures }) : [],
      link: detail
        ? buildTraceLinkSummary({
            detail,
            change: fallbackRelatedChange,
            issue: primaryIssue ?? null,
            evidenceFactors
          }) ?? undefined
        : undefined
    };

    return scenarios;
  }, {});
  const reviewCases = Object.values(traceScenarios).map((scenario) => scenario.reviewCase);

  // TODO: If future overview APIs return a selected trace detail before list data,
  // synthesize a one-item trace list here after the contract is finalized.
  return {
    defaultTraceId: resolvedSelectedTraceId ?? "",
    reviewCases,
    selectedTraceId: resolvedSelectedTraceId,
    traceScenarios
  };
}

export function mapTraceOverviewApiBundleToViewModelInput(
  bundle: TraceOverviewApiBundle
): TraceOverviewViewModelInput {
  return mapTraceOverviewDtosToViewModelInput({
    dashboardOverview: bundle.dashboardOverview,
    dashboardTimeline: bundle.dashboardTimeline,
    traces: bundle.traces,
    selectedTrace: bundle.selectedTrace,
    evidences: bundle.selectedTraceEvidences ?? { items: [] },
    primaryIssue: bundle.selectedTracePrimaryIssue,
    relatedChange: bundle.selectedTraceChange,
    selectedTraceId: bundle.selectedTrace?.trace_id ?? null
  });
}
