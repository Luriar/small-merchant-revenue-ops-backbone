import type { Translator } from "../../i18n/messages";
import type { ContextMetric } from "../../types/trace";

interface CorroboratingSignalsProps {
  items: ContextMetric[];
  t: Translator;
}

export function CorroboratingSignals({ items, t }: CorroboratingSignalsProps) {
  return (
    <article className="context-module">
      <h3>{t("corroboratingSignals")}</h3>
      <div className="compact-list">
        {items.map(([label, value]) => (
          <p key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </p>
        ))}
      </div>
    </article>
  );
}
