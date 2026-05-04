import type { MessageKey, Translator } from "../../i18n/messages";
import {
  formatEvidenceMixCounts,
  formatEvidenceFactorsObserved,
  formatMessage,
  translateFixedLabel,
  translateStatusLabel
} from "../../i18n/messages";
import type {
  EvidenceStrength,
  ReviewCase,
  TraceLinkRecommendedStep,
  TraceLinkReasoningItem,
  TraceLinkSummary
} from "../../types/trace";

interface InvestigationWorkbenchProps {
  evidenceCount: number;
  selectedCase: ReviewCase;
  link: TraceLinkSummary | null;
  t: Translator;
}

export function InvestigationWorkbench({
  evidenceCount,
  selectedCase,
  link,
  t
}: InvestigationWorkbenchProps) {
  if (!link) {
    return (
      <LegacyInvestigationWorkbench
        evidenceCount={evidenceCount}
        selectedCase={selectedCase}
        t={t}
      />
    );
  }

  const headerId = link.trace.idShort || selectedCase.incidentId;

  return (
    <aside className="investigation-workbench" aria-labelledby="workbench-title">
      <div className="workbench-header">
        <p className="eyebrow">{t("investigationWorkbench")}</p>
        <h2 id="workbench-title">{headerId}</h2>
        <span>
          {translateFixedLabel(link.trace.confidenceLabel, t)} · {link.trace.confidence}%
        </span>
      </div>
      <section className="workbench-section">
        <h3>{t("whyThisLink")}</h3>
        <p className="section-hint">{t(confidenceCopyKey(link.trace.confidenceTier))}</p>
        <dl>
          {link.reasoning.map((item) => (
            <div key={item.id}>
              <dt>{t(item.labelKey)}</dt>
              <dd>{formatTraceLinkBody(item, t)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="workbench-section">
        <h3>{t("suspectedTrace")}</h3>
        <dl>
          <div>
            <dt>{t("traceId")}</dt>
            <dd>{link.trace.idShort}</dd>
          </div>
          <div>
            <dt>{t("anomalyFingerprint")}</dt>
            <dd>{`${link.trace.anomalyType} / ${link.trace.anomalyMetric}`}</dd>
          </div>
          <div>
            <dt>{t("anomalyWindow")}</dt>
            <dd>{link.trace.anomalyWindow}</dd>
          </div>
          <div>
            <dt>{t("evidence")}</dt>
            <dd>{formatEvidenceFactorsObserved(link.trace.evidenceCount, t)}</dd>
          </div>
          <div>
            <dt>{t("evidenceMix")}</dt>
            <dd>{formatEvidenceMixCounts(link.trace.evidenceMixCounts, t)}</dd>
          </div>
        </dl>
      </section>
      {link.change && (
        <section className="workbench-section">
          <h3>{t("linkedChange")}</h3>
          <dl>
            <div>
              <dt>{t("title")}</dt>
              <dd>{link.change.title}</dd>
            </div>
            <div>
              <dt>{t("type")}</dt>
              <dd>{link.change.type}</dd>
            </div>
            <div>
              <dt>{t("service")}</dt>
              <dd>{link.change.targetService}</dd>
            </div>
            <div>
              <dt>{t("deployed")}</dt>
              <dd>{link.change.occurredAt}</dd>
            </div>
            <div>
              <dt>{t("source")}</dt>
              <dd>{link.change.source}</dd>
            </div>
            <div>
              <dt>{t("changeId")}</dt>
              <dd>{link.change.idShort}</dd>
            </div>
          </dl>
        </section>
      )}
      {link.issue && (
        <section className="workbench-section">
          <h3>{t("linkedIssueDetail")}</h3>
          <dl>
            <div>
              <dt>{t("title")}</dt>
              <dd>{link.issue.summary}</dd>
            </div>
            <div>
              <dt>{t("issueFamily")}</dt>
              <dd>{link.issue.family}</dd>
            </div>
            <div>
              <dt>{t("status")}</dt>
              <dd>{translateStatusLabel(link.issue.status, t)}</dd>
            </div>
            <div>
              <dt>{t("severity")}</dt>
              <dd>{link.issue.severity}</dd>
            </div>
            <div>
              <dt>{t("source")}</dt>
              <dd>{link.issue.source}</dd>
            </div>
            <div>
              <dt>{t("issueId")}</dt>
              <dd>{link.issue.idShort}</dd>
            </div>
          </dl>
        </section>
      )}
      <section className="workbench-section">
        <h3>{t("recommendedNextSteps")}</h3>
        <ul className="recommendation-list">
          {link.recommendedSteps.map((step) => (
            <li key={step.id}>
              <strong>{t(step.labelKey)}</strong>
              <span>{formatTraceLinkBody(step, t)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function formatTraceLinkBody(
  item: TraceLinkReasoningItem | TraceLinkRecommendedStep,
  t: Translator
): string {
  if (!item.bodyKey) {
    return item.body;
  }

  const params = { ...(item.bodyParams ?? {}) };

  if (item.bodyKey === "traceReasonEvidenceSupport") {
    const strong = Number(params.strong ?? 0);
    const medium = Number(params.medium ?? 0);
    const weak = Number(params.weak ?? 0);
    params.mix = formatEvidenceMixCounts({ strong, medium, weak }, t);
  }

  if (item.bodyKey === "traceStepReviewIssue" && typeof params.status === "string") {
    params.status = translateStatusLabel(params.status, t);
  }

  return formatMessage(item.bodyKey, params, t);
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

function LegacyInvestigationWorkbench({
  evidenceCount,
  selectedCase,
  t
}: {
  evidenceCount: number;
  selectedCase: ReviewCase;
  t: Translator;
}) {
  return (
    <aside className="investigation-workbench" aria-labelledby="workbench-title">
      <div className="workbench-header">
        <p className="eyebrow">{t("investigationWorkbench")}</p>
        <h2 id="workbench-title">{selectedCase.incidentId}</h2>
        <span>{translateStatusLabel(selectedCase.status, t)}</span>
      </div>
      <section className="workbench-section">
        <h3>{t("issueSummary")}</h3>
        <dl>
          <div>
            <dt>{t("title")}</dt>
            <dd>{selectedCase.title}</dd>
          </div>
          <div>
            <dt>{t("service")}</dt>
            <dd>{selectedCase.service}</dd>
          </div>
          <div>
            <dt>{t("issueFamily")}</dt>
            <dd>{selectedCase.issueFamily}</dd>
          </div>
        </dl>
      </section>
      <section className="workbench-section">
        <h3>{t("suspectedTrace")}</h3>
        <dl>
          <div>
            <dt>{t("trace")}</dt>
            <dd>{selectedCase.id}</dd>
          </div>
          <div>
            <dt>{t("confidence")}</dt>
            <dd>{selectedCase.confidence}%</dd>
          </div>
          <div>
            <dt>{t("evidence")}</dt>
            <dd>{formatEvidenceFactorsObserved(evidenceCount, t)}</dd>
          </div>
        </dl>
      </section>
      <section className="workbench-section">
        <h3>{t("relatedChange")}</h3>
        <dl>
          <div>
            <dt>{t("change")}</dt>
            <dd>{selectedCase.linkedChangeTitle}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
