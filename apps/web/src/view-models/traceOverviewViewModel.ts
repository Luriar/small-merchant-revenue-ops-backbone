import type {
  ContextMetric,
  EvidenceFactor,
  ReviewCase,
  TraceLinkSummary,
  TraceScenario,
  TraceStage
} from "../types/trace";

export interface TraceOverviewContextModulesViewModel {
  timeline: ContextMetric[];
  signals: ContextMetric[];
  reliability: ContextMetric[];
}

export interface TraceOverviewSummaryViewModel {
  reviewCaseCount: number;
}

export interface TraceOverviewViewModel {
  selectedScenario: TraceScenario | null;
  reviewCases: ReviewCase[];
  selectedTraceId: string | null;
  selectedTrace: ReviewCase | null;
  spineStages: TraceStage[];
  evidenceFactors: EvidenceFactor[];
  workbenchDetail: ReviewCase | null;
  contextModules: TraceOverviewContextModulesViewModel;
  scenarioOptions: ReviewCase[];
  summary: TraceOverviewSummaryViewModel;
  link: TraceLinkSummary | null;
}

interface BuildTraceOverviewViewModelParams {
  defaultTraceId: string;
  reviewCases: ReviewCase[];
  selectedTraceId: string | null;
  traceScenarios: Record<string, TraceScenario>;
}

function normalizeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function buildTraceOverviewViewModel({
  defaultTraceId,
  reviewCases,
  selectedTraceId,
  traceScenarios
}: BuildTraceOverviewViewModelParams): TraceOverviewViewModel {
  const scenarioEntries = Object.entries(traceScenarios).filter(([, scenario]) => Boolean(scenario));
  const selectedScenarioEntry =
    (selectedTraceId ? scenarioEntries.find(([traceId]) => traceId === selectedTraceId) : undefined) ??
    scenarioEntries.find(([traceId]) => traceId === defaultTraceId) ??
    scenarioEntries[0] ??
    null;

  const resolvedTraceId = selectedScenarioEntry?.[0] ?? null;
  const selectedScenario = selectedScenarioEntry?.[1] ?? null;
  const normalizedReviewCases =
    reviewCases.length > 0
      ? normalizeArray(reviewCases)
      : scenarioEntries.map(([, scenario]) => scenario.reviewCase).filter(Boolean);
  const selectedTrace =
    normalizedReviewCases.find((reviewCase) => reviewCase.id === resolvedTraceId) ??
    selectedScenario?.reviewCase ??
    null;

  return {
    selectedScenario,
    reviewCases: normalizedReviewCases,
    selectedTraceId: resolvedTraceId,
    selectedTrace,
    spineStages: normalizeArray(selectedScenario?.stages),
    evidenceFactors: normalizeArray(selectedScenario?.evidenceFactors),
    workbenchDetail: selectedTrace,
    contextModules: {
      timeline: normalizeArray(selectedScenario?.timeline),
      signals: normalizeArray(selectedScenario?.signals),
      reliability: normalizeArray(selectedScenario?.reliability)
    },
    scenarioOptions: normalizedReviewCases,
    summary: {
      reviewCaseCount: normalizedReviewCases.length
    },
    link: selectedScenario?.link ?? null
  };
}
