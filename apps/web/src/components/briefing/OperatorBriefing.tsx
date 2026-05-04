import { formatReviewQueueSummary, type Translator } from "../../i18n/messages";
import type { ReviewCase } from "../../types/trace";
import { ReviewCaseCard } from "./ReviewCaseCard";

interface OperatorBriefingProps {
  reviewCases: ReviewCase[];
  selectedTraceId: string | null;
  t: Translator;
  onSelectTrace: (traceId: string) => void;
}

export function OperatorBriefing({
  reviewCases,
  selectedTraceId,
  t,
  onSelectTrace
}: OperatorBriefingProps) {
  return (
    <section className="operator-briefing" aria-labelledby="operator-briefing-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("operatorBriefing")}</p>
          <h2 id="operator-briefing-title">{t("whatNeedsReviewNow")}</h2>
        </div>
        <span className="briefing-summary">
          {formatReviewQueueSummary(reviewCases.length, t)}
        </span>
      </div>
      <div className="review-grid">
        {reviewCases.map((item) => (
          <ReviewCaseCard
            item={item}
            isSelected={item.id === selectedTraceId}
            key={item.id}
            t={t}
            onSelect={onSelectTrace}
          />
        ))}
      </div>
    </section>
  );
}
