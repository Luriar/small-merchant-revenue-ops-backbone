import type { Translator } from "../../i18n/messages";
import type { ContextMetric } from "../../types/trace";
import { CorroboratingSignals } from "./CorroboratingSignals";
import { RecentTraceTimeline } from "./RecentTraceTimeline";
import { ReliabilityContext } from "./ReliabilityContext";

interface ContextModulesProps {
  timeline: ContextMetric[];
  signals: ContextMetric[];
  reliability: ContextMetric[];
  t: Translator;
}

export function ContextModules({ timeline, signals, reliability, t }: ContextModulesProps) {
  return (
    <section className="context-modules" aria-label={t("traceContextModules")}>
      <RecentTraceTimeline items={timeline} t={t} />
      <CorroboratingSignals items={signals} t={t} />
      <ReliabilityContext items={reliability} t={t} />
    </section>
  );
}
