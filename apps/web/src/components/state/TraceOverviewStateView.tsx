import type { Translator } from "../../i18n/messages";
import type { ViewState } from "../../types/viewState";

type NonReadyViewState = Exclude<ViewState, "ready">;

interface TraceOverviewStateViewProps {
  state: NonReadyViewState;
  t: Translator;
  onRetry: () => void;
  emptyBody?: string;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`state-skeleton ${className}`} />;
}

function LoadingStateView({ t }: { t: Translator }) {
  return (
    <>
      <section className="operator-briefing" aria-labelledby="overview-loading-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("operatorBriefing")}</p>
            <h2 id="overview-loading-title">{t("stateLoadingTitle")}</h2>
          </div>
          <span className="briefing-summary">{t("stateLoadingBody")}</span>
        </div>
        <div className="review-grid" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div className="review-case-card state-skeleton-card" key={item}>
              <SkeletonBlock className="state-skeleton-short" />
              <SkeletonBlock className="state-skeleton-title" />
              <SkeletonBlock />
              <SkeletonBlock className="state-skeleton-row" />
            </div>
          ))}
        </div>
      </section>
      <section className="trace-and-workbench" aria-label={t("traceInvestigationWorkspace")}>
        <div className="trace-column">
          <section className="trace-evidence-section" aria-labelledby="overview-loading-spine">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("selectedTrace")}</p>
                <h2 id="overview-loading-spine">
                  {t("productChangeToFollowUpReasoningPath")}
                </h2>
              </div>
            </div>
            <div className="trace-spine-layout">
              <div className="trace-spine-canvas state-spine-skeleton" aria-hidden="true">
                <SkeletonBlock className="state-skeleton-path" />
                <div className="state-stage-skeleton-grid">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <SkeletonBlock className="state-skeleton-stage" key={item} />
                  ))}
                </div>
              </div>
              <div className="evidence-strength-rail state-rail-skeleton" aria-hidden="true">
                <SkeletonBlock className="state-skeleton-rail-header" />
                <div className="rail-items">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <SkeletonBlock className="state-skeleton-factor" key={item} />
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="context-modules" aria-label={t("traceContextModules")}>
            {[t("recentTraceTimeline"), t("corroboratingSignals"), t("reliabilityContext")].map(
              (label) => (
                <div className="context-module state-context-skeleton" key={label}>
                  <h3>{label}</h3>
                  <SkeletonBlock />
                  <SkeletonBlock />
                  <SkeletonBlock className="state-skeleton-row" />
                </div>
              )
            )}
          </section>
        </div>
        <aside className="investigation-workbench state-workbench-skeleton" aria-hidden="true">
          <SkeletonBlock className="state-skeleton-title" />
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock className="state-skeleton-row" />
          <SkeletonBlock />
          <SkeletonBlock />
        </aside>
      </section>
    </>
  );
}

function MessageStateView({
  state,
  t,
  onRetry,
  emptyBody
}: {
  state: Exclude<NonReadyViewState, "loading">;
  t: Translator;
  onRetry: () => void;
  emptyBody?: string;
}) {
  const isError = state === "error";
  const title = isError ? t("stateErrorTitle") : t("stateEmptyTitle");
  const body = isError ? t("stateErrorBody") : emptyBody ?? t("stateEmptyBody");

  return (
    <>
      <section
        className={`overview-state-panel overview-state-${state}`}
        role={isError ? "alert" : "status"}
        aria-labelledby={`overview-${state}-title`}
      >
        <p className="eyebrow">{t("traceability")}</p>
        <h2 id={`overview-${state}-title`}>{title}</h2>
        <p>{body}</p>
        {isError ? (
          <button className="state-retry-action" type="button" onClick={onRetry}>
            {t("stateRetryLabel")}
          </button>
        ) : null}
      </section>
      <section className="trace-and-workbench" aria-label={t("traceInvestigationWorkspace")}>
        <div className="trace-column">
          <div className="trace-spine-canvas overview-state-canvas">
            <p className="eyebrow">{title}</p>
            <strong>{body}</strong>
          </div>
          <section className="context-modules" aria-label={t("traceContextModules")}>
            {[t("recentTraceTimeline"), t("corroboratingSignals"), t("reliabilityContext")].map(
              (label) => (
                <div className="context-module overview-state-context" key={label}>
                  <h3>{label}</h3>
                  <p>{body}</p>
                </div>
              )
            )}
          </section>
        </div>
        <aside className="investigation-workbench overview-state-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("investigationWorkbench")}</p>
            <h2>{title}</h2>
          </div>
          <p>{body}</p>
        </aside>
      </section>
    </>
  );
}

export function TraceOverviewStateView({
  state,
  t,
  onRetry,
  emptyBody
}: TraceOverviewStateViewProps) {
  return (
    <main className="main-workspace" aria-busy={state === "loading" ? "true" : undefined}>
      {state === "loading" ? (
        <LoadingStateView t={t} />
      ) : (
        <MessageStateView state={state} t={t} onRetry={onRetry} emptyBody={emptyBody} />
      )}
    </main>
  );
}
