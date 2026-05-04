import type { Translator } from "../../i18n/messages";
import type { ViewState } from "../../types/viewState";

type NonReadyViewState = Exclude<ViewState, "ready">;

interface ShellStateViewProps {
  state: NonReadyViewState;
  t: Translator;
  eyebrow: string;
  title: string;
  body: string;
  contextTitle: string;
  loadingTitle?: string;
  workbenchTitle: string;
  emptyBody?: string;
  onRetry: () => void;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`state-skeleton ${className}`} />;
}

function getStateCopy(state: NonReadyViewState, t: Translator, emptyBody?: string) {
  if (state === "loading") {
    return {
      title: t("stateLoadingTitle"),
      body: t("stateLoadingBody")
    };
  }

  if (state === "error") {
    return {
      title: t("stateErrorTitle"),
      body: t("stateErrorBody")
    };
  }

  return {
    title: t("stateEmptyTitle"),
    body: emptyBody ?? t("stateEmptyBody")
  };
}

export function ShellStateView({
  state,
  t,
  eyebrow,
  title,
  contextTitle,
  loadingTitle,
  workbenchTitle,
  emptyBody,
  onRetry
}: ShellStateViewProps) {
  const isLoading = state === "loading";
  const isError = state === "error";
  const copy = getStateCopy(state, t, emptyBody);
  const stateTitle = isLoading && loadingTitle ? loadingTitle : copy.title;

  return (
    <main className="main-workspace" aria-busy={isLoading ? "true" : undefined}>
      <section
        className={`overview-state-panel overview-state-${state}`}
        role={isError ? "alert" : "status"}
        aria-labelledby={`shell-${state}-title`}
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`shell-${state}-title`}>{title}</h2>
        <p>{copy.body}</p>
        {isError ? (
          <button className="state-retry-action" type="button" onClick={onRetry}>
            {t("stateRetryLabel")}
          </button>
        ) : null}
      </section>
      <section className="trace-and-workbench" aria-label={title}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby={`shell-${state}-context-title`}>
            <h3 id={`shell-${state}-context-title`}>{contextTitle}</h3>
            {isLoading ? (
              <>
                <SkeletonBlock />
                <SkeletonBlock />
                <SkeletonBlock className="state-skeleton-row" />
              </>
            ) : (
              <p>{copy.body}</p>
            )}
          </section>
          <section className="context-module" aria-labelledby={`shell-${state}-status-title`}>
            <h3 id={`shell-${state}-status-title`}>{stateTitle}</h3>
            {isLoading ? (
              <>
                <SkeletonBlock />
                <SkeletonBlock className="state-skeleton-row" />
              </>
            ) : (
              <p>{copy.body}</p>
            )}
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{workbenchTitle}</h2>
          </div>
          {isLoading ? (
            <>
              <SkeletonBlock className="state-skeleton-title" />
              <SkeletonBlock />
              <SkeletonBlock />
              <SkeletonBlock className="state-skeleton-row" />
            </>
          ) : (
            <p>{copy.body}</p>
          )}
        </aside>
      </section>
    </main>
  );
}
