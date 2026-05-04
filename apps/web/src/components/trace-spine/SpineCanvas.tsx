import type { Translator } from "../../i18n/messages";
import type { TraceStage, TraceStageId } from "../../types/trace";
import { SpineNodeLayer } from "./SpineNodeLayer";
import { SpinePathLayer } from "./SpinePathLayer";
import { SpineStagePanels } from "./SpineStagePanels";

interface SpineCanvasProps {
  stages: TraceStage[];
  activeStageIds: TraceStageId[];
  isTraceActive: boolean;
  t: Translator;
  onStageHover: (stageId: TraceStageId | null) => void;
}

export function SpineCanvas({
  stages,
  activeStageIds,
  isTraceActive,
  t,
  onStageHover
}: SpineCanvasProps) {
  return (
    <div
      className={`trace-spine-canvas ${isTraceActive ? "is-trace-active" : ""} ${activeStageIds.length > 0 ? "has-interaction" : ""}`}
    >
      <SpinePathLayer isActive={isTraceActive || activeStageIds.length > 0} />
      <SpineNodeLayer stages={stages} activeStageIds={activeStageIds} />
      <SpineStagePanels
        stages={stages}
        activeStageIds={activeStageIds}
        t={t}
        onStageHover={onStageHover}
      />
    </div>
  );
}
