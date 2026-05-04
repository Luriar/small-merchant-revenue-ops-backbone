import {
  DEFAULT_TRACE_ID,
  getEvidenceForStage,
  getStagesForEvidence,
  reviewCases,
  traceScenarios
} from "../data/mockTraceData";
import type { EvidenceType, ReviewCase, TraceScenario, TraceStageId } from "../types/trace";

export interface TraceOverviewMockData {
  defaultTraceId: string;
  reviewCases: ReviewCase[];
  traceScenarios: Record<string, TraceScenario>;
}

export function getTraceOverviewMockData(): TraceOverviewMockData {
  return {
    defaultTraceId: DEFAULT_TRACE_ID,
    reviewCases,
    traceScenarios
  };
}

export function getDefaultTraceId(): string {
  return DEFAULT_TRACE_ID;
}

export function getTraceScenarioOptions(): ReviewCase[] {
  return reviewCases;
}

export function getTraceScenarioById(traceId: string | null): TraceScenario | null {
  return traceId ? traceScenarios[traceId] ?? null : null;
}

export function getTraceStagesForEvidence(evidenceType: EvidenceType | null): TraceStageId[] {
  return getStagesForEvidence(evidenceType);
}

export function getTraceEvidenceForStage(stageId: TraceStageId | null): EvidenceType[] {
  return getEvidenceForStage(stageId);
}
