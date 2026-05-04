import type { TraceStage, TraceStageId } from "../../types/trace";

interface SpineNodeLayerProps {
  stages: TraceStage[];
  activeStageIds: TraceStageId[];
}

export function SpineNodeLayer({ stages, activeStageIds }: SpineNodeLayerProps) {
  return (
    <div className="spine-node-layer" aria-hidden="true">
      {stages.map((stage) => {
        const highlighted = activeStageIds.includes(stage.id);
        const muted = activeStageIds.length > 0 && !highlighted;

        return (
          <span
            className={`spine-node ${highlighted ? "is-highlighted" : ""} ${muted ? "is-muted" : ""}`}
            key={stage.id}
          >
            {stage.order}
          </span>
        );
      })}
    </div>
  );
}
