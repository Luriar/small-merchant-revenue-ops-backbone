import type {
  EvidenceFactor,
  EvidenceStrength,
  EvidenceType,
  FollowUpAction,
  ReviewCase,
  TraceLinkSummary,
  TraceScenario,
  TraceStage,
  TraceStageId
} from "../types/trace";

export const DEFAULT_TRACE_ID = "trace-inc-4872";

export const TRACE_STAGE_IDS: TraceStageId[] = [
  "product-change",
  "signal-anomaly",
  "linked-issue-cluster",
  "evidence-strength",
  "recommended-follow-up"
];

export const evidenceStageMap: Record<EvidenceType, TraceStageId[]> = {
  timing: ["product-change", "signal-anomaly"],
  variation: ["product-change", "signal-anomaly", "linked-issue-cluster"],
  event_spike: ["signal-anomaly", "linked-issue-cluster", "evidence-strength"],
  issue_family: ["linked-issue-cluster", "evidence-strength"],
  baseline_absence: ["signal-anomaly", "evidence-strength"],
  metric_deviation: ["signal-anomaly", "evidence-strength"],
  log_correlation: ["signal-anomaly", "evidence-strength"],
  support_ticket_pattern: ["linked-issue-cluster", "evidence-strength"]
};

export const stageEvidenceMap: Record<TraceStageId, EvidenceType[]> = {
  "product-change": ["timing", "variation"],
  "signal-anomaly": [
    "timing",
    "variation",
    "event_spike",
    "baseline_absence",
    "metric_deviation",
    "log_correlation"
  ],
  "linked-issue-cluster": [
    "variation",
    "event_spike",
    "issue_family",
    "support_ticket_pattern"
  ],
  "evidence-strength": [
    "timing",
    "variation",
    "event_spike",
    "issue_family",
    "baseline_absence",
    "metric_deviation",
    "log_correlation",
    "support_ticket_pattern"
  ],
  "recommended-follow-up": []
};

export function getStagesForEvidence(evidenceType: EvidenceType | null): TraceStageId[] {
  return evidenceType ? evidenceStageMap[evidenceType] : [];
}

export function getEvidenceForStage(stageId: TraceStageId | null): EvidenceType[] {
  return stageId ? stageEvidenceMap[stageId] : [];
}

export const followUpActions: FollowUpAction[] = [
  "Review release scope",
  "Review evidence",
  "Open linked issue",
  "Create incident handoff",
  "Notify owner",
  "View related failed runs",
  "Reprocess failed batch",
  "Retry failed run"
];

const reviewCase4872: ReviewCase = {
  id: "trace-inc-4872",
  incidentId: "INC-4872",
  riskLevel: "high",
  title: "Spike in payment failures",
  service: "Payments Service",
  linkedChangeTitle: "Checkout release v2.4.1",
  confidence: 88,
  affectedUsers: "23.1K",
  firstSeenAt: "10:11 AM",
  status: "investigating",
  issueFamily: "Payment Failures",
  primaryActionLabel: "Review evidence"
};

const reviewCase4891: ReviewCase = {
  id: "trace-inc-4891",
  incidentId: "INC-4891",
  riskLevel: "medium",
  title: "Checkout timeouts increased",
  service: "Payments Service",
  linkedChangeTitle: "Payment gateway config update",
  confidence: 62,
  affectedUsers: "8.4K",
  firstSeenAt: "10:26 AM",
  status: "open",
  issueFamily: "Checkout Timeouts",
  primaryActionLabel: "Review release scope"
};

const reviewCase4903: ReviewCase = {
  id: "trace-inc-4903",
  incidentId: "INC-4903",
  riskLevel: "low",
  title: "Pricing rule mismatch",
  service: "Pricing Service",
  linkedChangeTitle: "Pricing rules engine v1.7.0",
  confidence: 45,
  affectedUsers: "2.7K",
  firstSeenAt: "10:48 AM",
  status: "open",
  issueFamily: "Pricing Rule Mismatch",
  primaryActionLabel: "View details"
};

function stagesFor(params: {
  changeTitle: string;
  anomalyTitle: string;
  incidentId: string;
  issueFamily: string;
  service: string;
  serviceShort: string;
  deployedAt: string;
  changeType: string;
  confidence: number;
  affectedUsers: string;
  status: string;
  evidenceTypes: string;
  baseline: string;
  primaryAction: string;
  secondaryAction: string;
  handoffAction: string;
}): TraceStage[] {
  return [
    {
      id: "product-change",
      order: 1,
      icon: "C",
      title: "Product Change",
      subtitle: params.changeTitle,
      timeDeltaFromPrevious: params.deployedAt,
      metaRows: [
        { label: "Service", value: params.serviceShort },
        { label: "Deployed", value: params.deployedAt },
        { label: "Type", value: params.changeType }
      ]
    },
    {
      id: "signal-anomaly",
      order: 2,
      icon: "S",
      title: "Signal / Anomaly",
      subtitle: params.anomalyTitle,
      timeDeltaFromPrevious: "+9m",
      metaRows: [
        { label: "Window", value: "+9m" },
        { label: "Confidence", value: `${params.confidence}%` },
        { label: "Affected", value: params.affectedUsers }
      ]
    },
    {
      id: "linked-issue-cluster",
      order: 3,
      icon: "I",
      title: "Linked Issue",
      subtitle: params.incidentId,
      timeDeltaFromPrevious: "+13m",
      metaRows: [
        { label: "Family", value: params.issueFamily },
        { label: "Service", value: params.service },
        { label: "Status", value: params.status }
      ]
    },
    {
      id: "evidence-strength",
      order: 4,
      icon: "E",
      title: "Evidence Strength",
      subtitle: "5 evidence factors",
      timeDeltaFromPrevious: "+18m",
      metaRows: [
        { label: "Types", value: params.evidenceTypes },
        { label: "Baseline", value: params.baseline },
        { label: "Count", value: "5 factors" }
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
        { label: "Primary", value: params.primaryAction },
        { label: "Secondary", value: params.secondaryAction },
        { label: "Handoff", value: params.handoffAction }
      ]
    }
  ];
}

function summarizeEvidenceMix(factors: EvidenceFactor[]): string {
  const counts = countEvidenceStrengths(factors);

  return `${counts.strong} strong / ${counts.medium} medium / ${counts.weak} weak`;
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

function tierFromConfidence(confidence: number): EvidenceStrength {
  if (confidence >= 80) {
    return "strong";
  }

  if (confidence >= 60) {
    return "medium";
  }

  return "weak";
}

function buildMockLink(params: {
  reviewCase: ReviewCase;
  evidenceFactors: EvidenceFactor[];
  changeType: string;
  deployedAt: string;
  anomalyOffsetMinutes: number;
  anomalyType: string;
  anomalyMetric: string;
  anomalyWindow: string;
  changeShortId: string;
  issueShortId: string;
  changeSource: string;
  issueSource: string;
}): TraceLinkSummary {
  const tier = tierFromConfidence(params.reviewCase.confidence);
  const confidenceLabel = tier === "strong" ? "Strong" : tier === "medium" ? "Medium" : "Weak";
  const evidenceMixCounts = countEvidenceStrengths(params.evidenceFactors);

  return {
    trace: {
      id: params.reviewCase.id,
      idShort: params.reviewCase.id,
      confidence: params.reviewCase.confidence,
      confidenceTier: tier,
      confidenceLabel,
      anomalyType: params.anomalyType,
      anomalyMetric: params.anomalyMetric,
      anomalyWindow: params.anomalyWindow,
      evidenceCount: params.evidenceFactors.length,
      evidenceMixCounts,
      evidenceMixSummary: summarizeEvidenceMix(params.evidenceFactors)
    },
    change: {
      id: params.changeShortId,
      idShort: params.changeShortId,
      title: params.reviewCase.linkedChangeTitle,
      type: params.changeType,
      targetService: params.reviewCase.service,
      source: params.changeSource,
      occurredAt: params.deployedAt
    },
    issue: {
      id: params.reviewCase.incidentId,
      idShort: params.issueShortId,
      summary: params.reviewCase.title,
      family: params.reviewCase.issueFamily,
      status: params.reviewCase.status,
      source: params.issueSource,
      severity: "n/a"
    },
    reasoning: [
      {
        id: "anomaly-timing",
        labelKey: "anomalyTiming",
        body: `Anomaly window starts ${params.anomalyOffsetMinutes} min after the change.`,
        bodyKey:
          params.anomalyOffsetMinutes === 0
            ? "traceReasonAnomalySameMinute"
            : params.anomalyOffsetMinutes > 0
              ? "traceReasonAnomalyAfter"
              : "traceReasonAnomalyBefore",
        bodyParams: { minutes: Math.abs(params.anomalyOffsetMinutes) }
      },
      {
        id: "service-scope",
        labelKey: "serviceScope",
        body: `Change targets service: ${params.reviewCase.service}.`,
        bodyKey: "traceReasonServiceScope",
        bodyParams: { service: params.reviewCase.service }
      },
      {
        id: "issue-family",
        labelKey: "issueFamily",
        body: `Reported issue clusters under: ${params.reviewCase.issueFamily}.`,
        bodyKey: "traceReasonIssueFamily",
        bodyParams: { issueFamily: params.reviewCase.issueFamily }
      },
      {
        id: "evidence-support",
        labelKey: "evidenceSupport",
        body: `${params.evidenceFactors.length} factor(s) — ${summarizeEvidenceMix(params.evidenceFactors)}.`,
        bodyKey: "traceReasonEvidenceSupport",
        bodyParams: {
          count: params.evidenceFactors.length,
          strong: evidenceMixCounts.strong,
          medium: evidenceMixCounts.medium,
          weak: evidenceMixCounts.weak
        }
      },
      {
        id: "anomaly-fingerprint",
        labelKey: "anomalyFingerprint",
        body: `${params.anomalyType} anomaly on ${params.anomalyMetric}.`,
        bodyKey: "traceReasonAnomalyFingerprint",
        bodyParams: {
          anomalyType: params.anomalyType,
          metric: params.anomalyMetric
        }
      }
    ],
    recommendedSteps: [
      {
        id: "review-issue",
        labelKey: "reviewLinkedIssueLabel",
        body: `${params.issueShortId} · ${params.reviewCase.title} (status: ${params.reviewCase.status})`,
        bodyKey: "traceStepReviewIssue",
        bodyParams: {
          issueId: params.issueShortId,
          summary: params.reviewCase.title,
          status: params.reviewCase.status
        }
      },
      {
        id: "inspect-release-timing",
        labelKey: "inspectReleaseTimingLabel",
        body: `Change deployed at ${params.deployedAt} on ${params.reviewCase.service}.`,
        bodyKey: "traceStepInspectReleaseTiming",
        bodyParams: {
          time: params.deployedAt,
          service: params.reviewCase.service
        }
      },
      {
        id: "check-runs",
        labelKey: "checkFailedRetryRunsLabel",
        body: "Open the Reliability panel to inspect related runs and DLQ pressure.",
        bodyKey: "traceStepCheckRuns"
      }
    ]
  };
}

export const traceScenarios: Record<string, TraceScenario> = {
  "trace-inc-4872": {
    reviewCase: reviewCase4872,
    stages: stagesFor({
      changeTitle: "Checkout release v2.4.1",
      anomalyTitle: "Conversion drop / payment timeout spike",
      incidentId: "INC-4872",
      issueFamily: "Payment Failures",
      service: "Payments Service",
      serviceShort: "Payments",
      deployedAt: "10:02 AM",
      changeType: "Release",
      confidence: 88,
      affectedUsers: "23.1K",
      status: "Investigating",
      evidenceTypes: "Timing / Metric / Tickets",
      baseline: "Absent",
      primaryAction: "Review evidence",
      secondaryAction: "Open issue",
      handoffAction: "Create handoff"
    }),
    evidenceFactors: [
      {
        id: "timing",
        label: "Timing match",
        strength: "strong",
        description: "The payment failure spike begins 9 minutes after Checkout release v2.4.1.",
        relatedStages: evidenceStageMap.timing
      },
      {
        id: "variation",
        label: "Variation overlap",
        strength: "strong",
        description: "Affected checkout payment paths overlap the release scope.",
        relatedStages: evidenceStageMap.variation
      },
      {
        id: "event_spike",
        label: "Event spike alignment",
        strength: "strong",
        description: "Payment failure events rise in the same window as INC-4872.",
        relatedStages: evidenceStageMap.event_spike
      },
      {
        id: "issue_family",
        label: "Issue family match",
        strength: "medium",
        description: "Issue reports cluster under Payment Failures.",
        relatedStages: evidenceStageMap.issue_family
      },
      {
        id: "baseline_absence",
        label: "Prior baseline absence",
        strength: "medium",
        description: "No comparable payment failure pattern appears in the prior baseline.",
        relatedStages: evidenceStageMap.baseline_absence
      }
    ],
    timeline: [
      ["10:02 AM", "Checkout release v2.4.1 deployed"],
      ["10:11 AM", "Payment timeout spike detected"],
      ["10:15 AM", "INC-4872 linked to payment failures"],
      ["10:20 AM", "Evidence strength reached 88% confidence"]
    ],
    signals: [
      ["Payment failures", "+34% over baseline"],
      ["Checkout retries", "+22% within 15m"],
      ["Support pattern", "Payment Failures"]
    ],
    reliability: [
      ["Failed runs", "2 related ingestion runs"],
      ["DLQ pressure", "No active backlog"],
      ["CDC read-model", "Signal data synced"]
    ],
    link: buildMockLink({
      reviewCase: reviewCase4872,
      evidenceFactors: [
        { id: "timing", label: "Timing match", strength: "strong", description: "", relatedStages: [] },
        { id: "variation", label: "Variation overlap", strength: "strong", description: "", relatedStages: [] },
        { id: "event_spike", label: "Event spike alignment", strength: "strong", description: "", relatedStages: [] },
        { id: "issue_family", label: "Issue family match", strength: "medium", description: "", relatedStages: [] },
        { id: "baseline_absence", label: "Prior baseline absence", strength: "medium", description: "", relatedStages: [] }
      ],
      changeType: "Release",
      deployedAt: "10:02 AM",
      anomalyOffsetMinutes: 9,
      anomalyType: "error",
      anomalyMetric: "checkout.payment_failed",
      anomalyWindow: "10:11 AM – 10:13 AM",
      changeShortId: "ch-4872-rel",
      issueShortId: "INC-4872",
      changeSource: "deploy-system",
      issueSource: "support"
    })
  },
  "trace-inc-4891": {
    reviewCase: reviewCase4891,
    stages: stagesFor({
      changeTitle: "Payment gateway config update",
      anomalyTitle: "Checkout timeout increase",
      incidentId: "INC-4891",
      issueFamily: "Checkout Timeouts",
      service: "Payments Service",
      serviceShort: "Payments",
      deployedAt: "10:17 AM",
      changeType: "Config",
      confidence: 62,
      affectedUsers: "8.4K",
      status: "Open",
      evidenceTypes: "Timing / Metric / Log",
      baseline: "Changed",
      primaryAction: "Review scope",
      secondaryAction: "Review evidence",
      handoffAction: "Open issue"
    }),
    evidenceFactors: [
      {
        id: "timing",
        label: "Timing match",
        strength: "strong",
        description: "Timeouts increase shortly after the payment gateway config update.",
        relatedStages: evidenceStageMap.timing
      },
      {
        id: "metric_deviation",
        label: "Metric deviation",
        strength: "medium",
        description: "Checkout latency crosses the timeout threshold for payment attempts.",
        relatedStages: evidenceStageMap.metric_deviation
      },
      {
        id: "log_correlation",
        label: "Log correlation",
        strength: "medium",
        description: "Gateway timeout logs align with the affected checkout path.",
        relatedStages: evidenceStageMap.log_correlation
      },
      {
        id: "issue_family",
        label: "Issue family match",
        strength: "medium",
        description: "Issue reports cluster under Checkout Timeouts.",
        relatedStages: evidenceStageMap.issue_family
      },
      {
        id: "baseline_absence",
        label: "Prior baseline absence",
        strength: "weak",
        description: "Previous timeout baseline was lower but not fully absent.",
        relatedStages: evidenceStageMap.baseline_absence
      }
    ],
    timeline: [
      ["10:17 AM", "Payment gateway config update applied"],
      ["10:26 AM", "Checkout timeout increase detected"],
      ["10:31 AM", "INC-4891 linked to timeout cluster"],
      ["10:36 AM", "Evidence strength reached 62% confidence"]
    ],
    signals: [
      ["Checkout timeouts", "+19% over baseline"],
      ["Gateway retries", "+11% within 15m"],
      ["Support pattern", "Checkout Timeouts"]
    ],
    reliability: [
      ["Failed runs", "1 related ingestion run"],
      ["DLQ pressure", "No active backlog"],
      ["CDC read-model", "Latency markers synced"]
    ],
    link: buildMockLink({
      reviewCase: reviewCase4891,
      evidenceFactors: [
        { id: "timing", label: "Timing match", strength: "strong", description: "", relatedStages: [] },
        { id: "metric_deviation", label: "Metric deviation", strength: "medium", description: "", relatedStages: [] },
        { id: "log_correlation", label: "Log correlation", strength: "medium", description: "", relatedStages: [] },
        { id: "issue_family", label: "Issue family match", strength: "medium", description: "", relatedStages: [] },
        { id: "baseline_absence", label: "Prior baseline absence", strength: "weak", description: "", relatedStages: [] }
      ],
      changeType: "Config",
      deployedAt: "10:17 AM",
      anomalyOffsetMinutes: 9,
      anomalyType: "error",
      anomalyMetric: "checkout.timeout",
      anomalyWindow: "10:26 AM – 10:31 AM",
      changeShortId: "ch-4891-cfg",
      issueShortId: "INC-4891",
      changeSource: "config-system",
      issueSource: "support"
    })
  },
  "trace-inc-4903": {
    reviewCase: reviewCase4903,
    stages: stagesFor({
      changeTitle: "Pricing rules engine v1.7.0",
      anomalyTitle: "Pricing validation mismatch",
      incidentId: "INC-4903",
      issueFamily: "Pricing Rule Mismatch",
      service: "Pricing Service",
      serviceShort: "Pricing",
      deployedAt: "10:39 AM",
      changeType: "Rule",
      confidence: 45,
      affectedUsers: "2.7K",
      status: "Open",
      evidenceTypes: "Variation / Log / Family",
      baseline: "Mixed",
      primaryAction: "Review evidence",
      secondaryAction: "Notify owner",
      handoffAction: "Open issue"
    }),
    evidenceFactors: [
      {
        id: "variation",
        label: "Variation overlap",
        strength: "medium",
        description: "Mismatches appear on paths touched by pricing rules engine v1.7.0.",
        relatedStages: evidenceStageMap.variation
      },
      {
        id: "log_correlation",
        label: "Log correlation",
        strength: "medium",
        description: "Validation mismatch logs align with pricing rule evaluation.",
        relatedStages: evidenceStageMap.log_correlation
      },
      {
        id: "issue_family",
        label: "Issue family match",
        strength: "medium",
        description: "Issue reports cluster under Pricing Rule Mismatch.",
        relatedStages: evidenceStageMap.issue_family
      },
      {
        id: "event_spike",
        label: "Event spike alignment",
        strength: "weak",
        description: "Mismatch events increased, but the spike is narrower than the incident window.",
        relatedStages: evidenceStageMap.event_spike
      },
      {
        id: "baseline_absence",
        label: "Prior baseline absence",
        strength: "weak",
        description: "Prior mismatch signals exist, lowering confidence.",
        relatedStages: evidenceStageMap.baseline_absence
      }
    ],
    timeline: [
      ["10:39 AM", "Pricing rules engine v1.7.0 deployed"],
      ["10:48 AM", "Pricing validation mismatch detected"],
      ["10:53 AM", "INC-4903 linked to pricing issue family"],
      ["10:59 AM", "Evidence strength reached 45% confidence"]
    ],
    signals: [
      ["Validation mismatch", "+12% over baseline"],
      ["Pricing recalculations", "+7% within 15m"],
      ["Support pattern", "Pricing Rule Mismatch"]
    ],
    reliability: [
      ["Failed runs", "No related failed runs"],
      ["DLQ pressure", "No active backlog"],
      ["CDC read-model", "Pricing events synced"]
    ],
    link: buildMockLink({
      reviewCase: reviewCase4903,
      evidenceFactors: [
        { id: "variation", label: "Variation overlap", strength: "medium", description: "", relatedStages: [] },
        { id: "log_correlation", label: "Log correlation", strength: "medium", description: "", relatedStages: [] },
        { id: "issue_family", label: "Issue family match", strength: "medium", description: "", relatedStages: [] },
        { id: "event_spike", label: "Event spike alignment", strength: "weak", description: "", relatedStages: [] },
        { id: "baseline_absence", label: "Prior baseline absence", strength: "weak", description: "", relatedStages: [] }
      ],
      changeType: "Rule",
      deployedAt: "10:39 AM",
      anomalyOffsetMinutes: 9,
      anomalyType: "cohort",
      anomalyMetric: "pricing.validation_mismatch",
      anomalyWindow: "10:48 AM – 10:54 AM",
      changeShortId: "ch-4903-rul",
      issueShortId: "INC-4903",
      changeSource: "config-system",
      issueSource: "support"
    })
  }
};

export const reviewCases: ReviewCase[] = Object.values(traceScenarios).map(
  (scenario) => scenario.reviewCase
);
