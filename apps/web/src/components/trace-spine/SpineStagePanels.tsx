import { translateFixedLabel, translateStatusLabel, type Translator } from "../../i18n/messages";
import type { TraceStage, TraceStageId } from "../../types/trace";

interface SpineStagePanelsProps {
  stages: TraceStage[];
  activeStageIds: TraceStageId[];
  t: Translator;
  onStageHover: (stageId: TraceStageId | null) => void;
}

export function SpineStagePanels({
  stages,
  activeStageIds,
  t,
  onStageHover
}: SpineStagePanelsProps) {
  return (
    <div className="spine-stage-panels">
      {stages.map((stage) => {
        const highlighted = activeStageIds.includes(stage.id);
        const muted = activeStageIds.length > 0 && !highlighted;
        const isFollowUpStage = stage.id === "recommended-follow-up";

        return (
          <article
            className={`stage-panel ${isFollowUpStage ? "is-follow-up-stage" : ""} ${highlighted ? "is-highlighted" : ""} ${muted ? "is-muted" : ""}`}
            key={stage.id}
            onMouseEnter={() => onStageHover(stage.id)}
            onMouseLeave={() => onStageHover(null)}
            onFocus={() => onStageHover(stage.id)}
            onBlur={() => onStageHover(null)}
            tabIndex={0}
          >
            <div className="stage-panel-top">
              <span className="stage-icon">{stage.icon}</span>
              <span className="stage-time">{stage.timeDeltaFromPrevious}</span>
            </div>
            <h3>{translateFixedLabel(stage.title, t)}</h3>
            <p className="stage-subtitle">{translateFixedLabel(stage.subtitle, t)}</p>
            {isFollowUpStage ? (
              <div className="stage-action-chips" aria-label={t("recommendedFollowUp")}>
                {stage.metaRows.map((row) => (
                  <span key={row.label}>{translateFixedLabel(row.value, t)}</span>
                ))}
              </div>
            ) : (
              <dl className="stage-meta-rows">
                {stage.metaRows.map((row) => (
                  <div key={row.label}>
                    <dt>{translateFixedLabel(row.label, t)}</dt>
                    <dd>
                      {row.label === "Status"
                        ? translateStatusLabel(row.value, t)
                        : row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
    </div>
  );
}
