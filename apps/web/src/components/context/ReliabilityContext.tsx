import type { Translator } from "../../i18n/messages";
import type { ContextMetric } from "../../types/trace";

interface ReliabilityContextProps {
  items: ContextMetric[];
  t: Translator;
}

export function ReliabilityContext({ items, t }: ReliabilityContextProps) {
  return (
    <article className="context-module">
      <h3>{t("reliabilityContext")}</h3>
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
