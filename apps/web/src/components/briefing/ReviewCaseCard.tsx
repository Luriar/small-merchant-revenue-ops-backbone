import {
  translateFixedLabel,
  translateStatusLabel,
  type Translator
} from "../../i18n/messages";
import type { ReviewCase } from "../../types/trace";

interface ReviewCaseCardProps {
  item: ReviewCase;
  isSelected: boolean;
  t: Translator;
  onSelect: (traceId: string) => void;
}

export function ReviewCaseCard({ item, isSelected, t, onSelect }: ReviewCaseCardProps) {
  return (
    <button
      className={`review-case-card ${isSelected ? "is-selected" : "is-secondary"} risk-${item.riskLevel}`}
      type="button"
      onClick={() => onSelect(item.id)}
    >
      <span className="case-topline">
        <strong>{item.incidentId}</strong>
        <span>{translateStatusLabel(item.status, t)}</span>
      </span>
      <span className="case-title">{item.title}</span>
      <span className="case-change">{item.linkedChangeTitle}</span>
      <span className="case-meta">
        <span>{item.service}</span>
        <span>
          {item.affectedUsers} {t("affected")}
        </span>
      </span>
      <span className="case-footer">
        <span className="confidence">
          {item.confidence}% {t("confidenceInline")}
        </span>
        <span className="case-action">{translateFixedLabel(item.primaryActionLabel, t)}</span>
      </span>
    </button>
  );
}
