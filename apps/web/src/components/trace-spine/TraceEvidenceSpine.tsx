import type { Translator } from "../../i18n/messages";
import type {
  EvidenceFactor,
  EvidenceStrength,
  EvidenceType,
  ReviewCase,
  TraceStage,
  TraceStageId
} from "../../types/trace";
import { EvidenceStrengthRail } from "./EvidenceStrengthRail";
import { SpineCanvas } from "./SpineCanvas";

interface TraceEvidenceSpineProps {
  selectedTraceId: string | null;
  selectedTraceIdShort: string;
  selectedCase: ReviewCase;
  stages: TraceStage[];
  evidenceFactors: EvidenceFactor[];
  activeStageIds: TraceStageId[];
  activeEvidenceTypes: EvidenceType[];
  focusedEvidenceId: string | null;
  confidenceTier: EvidenceStrength;
  t: Translator;
  onStageHover: (stageId: TraceStageId | null) => void;
  onEvidenceHover: (evidenceType: EvidenceType | null) => void;
  onEvidenceFocus: (evidenceId: string | null) => void;
}

export function TraceEvidenceSpine({
  selectedTraceId,
  selectedTraceIdShort,
  selectedCase,
  stages,
  evidenceFactors,
  activeStageIds,
  activeEvidenceTypes,
  focusedEvidenceId,
  confidenceTier,
  t,
  onStageHover,
  onEvidenceHover,
  onEvidenceFocus
}: TraceEvidenceSpineProps) {
  return (
    <section className="trace-evidence-section" aria-labelledby="trace-spine-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("selectedTrace")}</p>
          <h2 id="trace-spine-title">{t("productChangeToFollowUpReasoningPath")}</h2>
        </div>
        <span className="trace-id-label">
          {selectedCase.incidentId} / {selectedTraceIdShort}
        </span>
      </div>
      <div className="trace-spine-layout">
        <SpineCanvas
          stages={stages}
          activeStageIds={activeStageIds}
          isTraceActive={selectedTraceId !== null}
          t={t}
          onStageHover={onStageHover}
        />
        <EvidenceStrengthRail
          evidenceFactors={evidenceFactors}
          activeEvidenceTypes={activeEvidenceTypes}
          focusedEvidenceId={focusedEvidenceId}
          confidence={selectedCase.confidence}
          confidenceTier={confidenceTier}
          t={t}
          onEvidenceHover={onEvidenceHover}
          onEvidenceFocus={onEvidenceFocus}
        />
      </div>
    </section>
  );
}
