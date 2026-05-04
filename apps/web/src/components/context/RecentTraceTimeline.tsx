import type { Translator } from "../../i18n/messages";
import type { ContextMetric } from "../../types/trace";

interface RecentTraceTimelineProps {
  items: ContextMetric[];
  t: Translator;
}

export function RecentTraceTimeline({ items, t }: RecentTraceTimelineProps) {
  return (
    <article className="context-module">
      <h3>{t("recentTraceTimeline")}</h3>
      <ol className="timeline-list">
        {items.map(([time, label]) => (
          <li key={`${time}-${label}`}>
            <span>{time}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
    </article>
  );
}
