import type { MessageKey, Translator } from "../../i18n/messages";
import { translateEvidenceDescription, translateFixedLabel } from "../../i18n/messages";
import type { EvidenceFactor, EvidenceStrength, EvidenceType } from "../../types/trace";

interface EvidenceStrengthRailProps {
  evidenceFactors: EvidenceFactor[];
  activeEvidenceTypes: EvidenceType[];
  focusedEvidenceId: string | null;
  confidence: number;
  confidenceTier: EvidenceStrength;
  t: Translator;
  onEvidenceHover: (evidenceType: EvidenceType | null) => void;
  onEvidenceFocus: (evidenceId: string | null) => void;
}

export function EvidenceStrengthRail({
  evidenceFactors,
  activeEvidenceTypes,
  focusedEvidenceId,
  confidence,
  confidenceTier,
  t,
  onEvidenceHover,
  onEvidenceFocus
}: EvidenceStrengthRailProps) {
  return (
    <aside className="evidence-strength-rail" aria-label={t("evidenceStrength")}>
      <div className="rail-header">
        <span>{t("evidenceStrength")}</span>
        <strong>{confidence}%</strong>
      </div>
      <p className="rail-subhead">{t(confidenceCopyKey(confidenceTier))}</p>
      <div className="rail-items">
        {evidenceFactors.map((factor) => {
          const highlighted = activeEvidenceTypes.includes(factor.id);
          const muted = activeEvidenceTypes.length > 0 && !highlighted;
          const focused = focusedEvidenceId === factor.id;

          return (
            <button
              className={`evidence-factor strength-${factor.strength} ${highlighted ? "is-highlighted" : ""} ${muted ? "is-muted" : ""} ${focused ? "is-focused" : ""}`}
              key={factor.id}
              type="button"
              onMouseEnter={() => onEvidenceHover(factor.id)}
              onMouseLeave={() => onEvidenceHover(null)}
              onFocus={() => {
                onEvidenceHover(factor.id);
                onEvidenceFocus(factor.id);
              }}
              onBlur={() => {
                onEvidenceHover(null);
                onEvidenceFocus(null);
              }}
            >
              <span className="factor-topline">
                <strong>{translateFixedLabel(factor.label, t)}</strong>
                <span>{translateFixedLabel(factor.strength, t)}</span>
              </span>
              <span className="factor-description">
                {translateEvidenceDescription(factor.description, t)}
              </span>
              {factor.sourceRef ? (
                <span className="factor-source-ref">
                  <span>{t("sourceRef")}</span>
                  <code>{factor.sourceRef}</code>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function confidenceCopyKey(tier: EvidenceStrength): MessageKey {
  if (tier === "strong") {
    return "confidenceCopyStrong";
  }

  if (tier === "medium") {
    return "confidenceCopyMedium";
  }

  return "confidenceCopyWeak";
}
