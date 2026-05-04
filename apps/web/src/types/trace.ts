export type TraceStageId =
  | "product-change"
  | "signal-anomaly"
  | "linked-issue-cluster"
  | "evidence-strength"
  | "recommended-follow-up";

export type EvidenceType =
  | "timing"
  | "variation"
  | "event_spike"
  | "issue_family"
  | "baseline_absence"
  | "metric_deviation"
  | "log_correlation"
  | "support_ticket_pattern";

export type EvidenceStrength = "strong" | "medium" | "weak";
export type ReviewRiskLevel = "high" | "medium" | "low";
export type ReviewStatus = "open" | "investigating";
export type IssueStatus = "open" | "investigating" | "resolved" | "ignored";
export type ChangeType = "release" | "flag" | "rule";

export type FollowUpAction =
  | "Review release scope"
  | "Review evidence"
  | "Open linked issue"
  | "Create incident handoff"
  | "Notify owner"
  | "View related failed runs"
  | "Reprocess failed batch"
  | "Retry failed run";

export interface ReviewCase {
  id: string;
  incidentId: string;
  riskLevel: ReviewRiskLevel;
  title: string;
  service: string;
  linkedChangeTitle: string;
  confidence: number;
  affectedUsers: string;
  firstSeenAt: string;
  status: ReviewStatus;
  issueFamily: string;
  primaryActionLabel: string;
}

export interface TraceStageMetaRow {
  label: string;
  value: string;
}

export interface TraceStage {
  id: TraceStageId;
  order: number;
  icon: string;
  title: string;
  subtitle: string;
  timeDeltaFromPrevious?: string;
  metaRows: TraceStageMetaRow[];
}

export interface EvidenceFactor {
  id: EvidenceType;
  label: string;
  strength: EvidenceStrength;
  relatedStages: TraceStageId[];
  description: string;
  sourceRef?: string;
  evidenceIdShort?: string;
}

export interface TraceLinkChange {
  id: string;
  idShort: string;
  title: string;
  type: string;
  targetService: string;
  source: string;
  occurredAt: string;
}

export interface TraceLinkIssue {
  id: string;
  idShort: string;
  summary: string;
  family: string;
  status: string;
  source: string;
  severity: string;
}

export type TraceLinkReasoningLabelKey =
  | "anomalyTiming"
  | "serviceScope"
  | "issueFamily"
  | "evidenceSupport"
  | "anomalyFingerprint";

export type TraceLinkRecommendedStepLabelKey =
  | "reviewLinkedIssueLabel"
  | "inspectReleaseTimingLabel"
  | "checkFailedRetryRunsLabel";

export type TraceLinkBodyKey =
  | "traceReasonAnomalyAfter"
  | "traceReasonAnomalyBefore"
  | "traceReasonAnomalySameMinute"
  | "traceReasonServiceScope"
  | "traceReasonIssueFamily"
  | "traceReasonEvidenceSupport"
  | "traceReasonAnomalyFingerprint"
  | "traceStepReviewIssue"
  | "traceStepInspectReleaseTiming"
  | "traceStepCheckRuns";

export type TraceLinkBodyParams = Record<string, string | number>;

export interface TraceLinkReasoningItem {
  id: string;
  labelKey: TraceLinkReasoningLabelKey;
  body: string;
  bodyKey?: TraceLinkBodyKey;
  bodyParams?: TraceLinkBodyParams;
}

export interface TraceLinkRecommendedStep {
  id: string;
  labelKey: TraceLinkRecommendedStepLabelKey;
  body: string;
  bodyKey?: TraceLinkBodyKey;
  bodyParams?: TraceLinkBodyParams;
}

export interface TraceLinkSummary {
  trace: {
    id: string;
    idShort: string;
    confidence: number;
    confidenceTier: EvidenceStrength;
    confidenceLabel: string;
    anomalyType: string;
    anomalyMetric: string;
    anomalyWindow: string;
    evidenceCount: number;
    evidenceMixCounts: Record<EvidenceStrength, number>;
    evidenceMixSummary: string;
  };
  change: TraceLinkChange | null;
  issue: TraceLinkIssue | null;
  reasoning: TraceLinkReasoningItem[];
  recommendedSteps: TraceLinkRecommendedStep[];
}

export interface InvestigationWorkbenchData {
  issue: {
    id: string;
    title: string;
    service: string;
    status: IssueStatus;
    issueFamily: string;
    affectedUsers: string;
    firstSeenAt: string;
  };
  trace: {
    id: string;
    confidence: number;
    evidenceCount: number;
    anomalySummary: string;
  };
  relatedChange: {
    id: string;
    title: string;
    deployedAt: string;
    service: string;
    changeType: ChangeType;
    reason: string;
  };
  followUps: FollowUpAction[];
}

export interface SpineInteractionState {
  selectedTraceId: string | null;
  hoveredStageId: TraceStageId | null;
  hoveredEvidenceType: EvidenceType | null;
  focusedEvidenceId: string | null;
}

export type ContextMetric = readonly [label: string, value: string];

export interface TraceScenario {
  reviewCase: ReviewCase;
  stages: TraceStage[];
  evidenceFactors: EvidenceFactor[];
  timeline: ContextMetric[];
  signals: ContextMetric[];
  reliability: ContextMetric[];
  link?: TraceLinkSummary;
}
