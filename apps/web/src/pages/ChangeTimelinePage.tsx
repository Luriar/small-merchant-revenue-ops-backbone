import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ShellStateView } from "../components/state/ShellStateView";
import type { ChangeTimelineApiBundle } from "../api/traceOverviewBundles";
import { useChangeTimelineApiBundle } from "../hooks/useChangeTimelineApiBundle";
import type { usePreferences } from "../hooks/usePreferences";
import type { Translator } from "../i18n/messages";
import type { MessageKey } from "../i18n/messages";
import { resolveDemoMode, type DemoMode } from "../state/demoMode";
import { resolveDataSource, type DataSource } from "../state/dataSource";
import { getReadyStateUrl, resolveViewState } from "../state/viewState";
import type { AppPage } from "../types/navigation";
import type { ViewState } from "../types/viewState";

interface ChangeTimelinePageProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  preferences: ReturnType<typeof usePreferences>;
}

const summaryCards: Array<{ title: MessageKey; body: MessageKey }> = [
  { title: "releaseChanges", body: "releaseChangesBody" },
  { title: "flagChanges", body: "flagChangesBody" },
  { title: "ruleChanges", body: "ruleChangesBody" }
];

const timelineRows: Array<{ time: string; label: MessageKey }> = [
  { time: "T+0", label: "releaseChanges" },
  { time: "T+5", label: "flagChanges" },
  { time: "T+10", label: "ruleChanges" }
];

interface ChangeTimelineContentProps {
  demoMode: DemoMode;
  preferences: ReturnType<typeof usePreferences>;
}

interface ApiChangeTimelineContentProps {
  bundle: ChangeTimelineApiBundle;
  preferences: ReturnType<typeof usePreferences>;
  onSelectChange: (changeId: string) => void;
}

type NonReadyViewState = Exclude<ViewState, "ready">;

function getInitialViewState(): ViewState {
  return typeof window === "undefined" ? "ready" : resolveViewState(window.location.search);
}

function getInitialDataSource(): DataSource {
  return typeof window === "undefined" ? "mock" : resolveDataSource(window.location.search);
}

function getInitialDemoMode(): DemoMode {
  return typeof window === "undefined" ? null : resolveDemoMode(window.location.search);
}

export function ChangeTimelinePage({
  activePage,
  onNavigate,
  preferences
}: ChangeTimelinePageProps) {
  const { t } = preferences;
  const [viewState, setViewState] = useState<ViewState>(getInitialViewState);
  const [dataSource, setDataSource] = useState<DataSource>(getInitialDataSource);
  const [demoMode, setDemoMode] = useState<DemoMode>(getInitialDemoMode);

  useEffect(() => {
    const handleHistoryChange = () => {
      setViewState(resolveViewState(window.location.search));
      setDataSource(resolveDataSource(window.location.search));
      setDemoMode(resolveDemoMode(window.location.search));
    };

    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, []);

  const resetViewState = () => {
    setViewState("ready");
    window.history.replaceState(null, "", getReadyStateUrl(window.location));
  };

  return (
    <AppShell
      activePage={activePage}
      demoMode={demoMode}
      headerTitleKey="changeTimelineTitle"
      onNavigate={onNavigate}
      preferences={preferences}
    >
      {viewState !== "ready" ? (
        <ChangeTimelineStateView
          state={viewState}
          t={t}
          onRetry={resetViewState}
          emptyBody={demoMode === "m1" ? t("demoM1EmptyBody") : undefined}
        />
      ) : dataSource === "api" ? (
        <ApiChangeTimelineContent demoMode={demoMode} preferences={preferences} />
      ) : (
        <StaticChangeTimelineContent demoMode={demoMode} preferences={preferences} />
      )}
    </AppShell>
  );
}

function ChangeTimelineStateView({
  state,
  t,
  onRetry,
  emptyBody
}: {
  state: NonReadyViewState;
  t: Translator;
  onRetry: () => void;
  emptyBody?: string;
}) {
  return (
    <ShellStateView
      state={state}
      t={t}
      eyebrow={t("changes")}
      title={t("changeTimelineTitle")}
      body={t("changeTimelineBody")}
      contextTitle={t("changeTimelineReviewTitle")}
      loadingTitle={t("changeTimelineLoadingTitle")}
      workbenchTitle={t("derivedSuspectedTraces")}
      emptyBody={emptyBody}
      onRetry={onRetry}
    />
  );
}

function StaticChangeTimelineContent({ preferences }: ChangeTimelineContentProps) {
  const { t } = preferences;

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="change-timeline-title">
        <p className="eyebrow">{t("changes")}</p>
        <h2 id="change-timeline-title">{t("changeTimelineTitle")}</h2>
        <p>{t("changeTimelineBody")}</p>
      </section>
      <section className="review-grid" aria-label={t("changes")}>
        {summaryCards.map((card) => (
          <div className="context-module" key={card.title}>
            <h3>{t(card.title)}</h3>
            <p>{t(card.body)}</p>
          </div>
        ))}
      </section>
      <section className="trace-and-workbench" aria-label={t("changeTimelineTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="change-review-timeline-title">
            <h3 id="change-review-timeline-title">{t("changeTimelineReviewTitle")}</h3>
            <p>{t("changeTimelineReviewBody")}</p>
            <ul className="timeline-list">
              {timelineRows.map((row) => (
                <li key={row.time}>
                  <span>{row.time}</span>
                  <strong>{t(row.label)}</strong>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("traceability")}</p>
            <h2>{t("derivedSuspectedTraces")}</h2>
          </div>
          <p>{t("derivedSuspectedTracesBody")}</p>
        </aside>
      </section>
    </main>
  );
}

function ApiChangeTimelineContent({ demoMode, preferences }: ChangeTimelineContentProps) {
  const { t } = preferences;
  const [selectedChangeId, setSelectedChangeId] = useState<string | undefined>(undefined);
  const apiState = useChangeTimelineApiBundle(selectedChangeId, demoMode);
  const emptyBody = demoMode === "m1" ? t("demoM1EmptyBody") : undefined;

  if (apiState.status !== "ready") {
    return <ChangeTimelineStateView state={apiState.status} t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  if (!apiState.bundle.selectedChange) {
    return <ChangeTimelineStateView state="empty" t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  return (
    <ApiChangeTimelineReadyContent
      bundle={apiState.bundle}
      preferences={preferences}
      onSelectChange={setSelectedChangeId}
    />
  );
}

function ApiChangeTimelineReadyContent({
  bundle,
  preferences,
  onSelectChange
}: ApiChangeTimelineContentProps) {
  const { t } = preferences;
  const selectedChange = bundle.selectedChange;
  const selectedChangeId = selectedChange?.change_id;
  const traces = bundle.selectedChangeTraces?.items ?? [];
  const summary = deriveChangeSummary(bundle.changes.items ?? []);
  const cards = [
    {
      title: t("releaseChanges"),
      body: `${formatCount(summary?.release_count)} release changes`
    },
    {
      title: t("flagChanges"),
      body: `${formatCount(summary?.flag_count)} flag changes`
    },
    {
      title: t("ruleChanges"),
      body: `${formatCount(summary?.rule_count)} rule changes`
    }
  ];
  const changeRows = (bundle.changes.items ?? []).map((change, index) => ({
    key: change.change_id ?? `change-${index}`,
    id: change.change_id,
    time: formatTime(change.occurred_at),
    label: change.title ?? "Untitled change"
  }));

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="change-timeline-title">
        <p className="eyebrow">{t("changes")}</p>
        <h2 id="change-timeline-title">{selectedChange?.title ?? t("changeTimelineTitle")}</h2>
        <p>{t("changeTimelineBody")}</p>
      </section>
      <section className="review-grid" aria-label={t("changes")}>
        {cards.map((card) => (
          <div className="context-module" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </div>
        ))}
      </section>
      <section className="trace-and-workbench" aria-label={t("changeTimelineTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="change-review-timeline-title">
            <h3 id="change-review-timeline-title">{t("changeTimelineReviewTitle")}</h3>
            <p>
              {selectedChange?.change_type ?? "change"} / {selectedChange?.target_service ?? "service"} /{" "}
              {formatTime(selectedChange?.occurred_at)}
            </p>
            <ul className="timeline-list">
              {changeRows.map((row) => (
                <li key={row.key}>
                  <button
                    className={row.id === selectedChangeId ? "is-selected" : undefined}
                    type="button"
                    onClick={() => { if (row.id) onSelectChange(row.id); }}
                  >
                    <span>{row.time}</span>
                    <strong>{row.label}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("traceability")}</p>
            <h2>{t("derivedSuspectedTraces")}</h2>
          </div>
          <p>{`${traces.length} linked suspected trace${traces.length === 1 ? "" : "s"}`}</p>
          <dl>
            {traces.map((trace) => (
              <div key={trace.trace_id ?? trace.anomaly_metric ?? "trace"}>
                <dt>{trace.trace_id ?? "trace"}</dt>
                <dd>{formatTraceSummary(trace.anomaly_type, trace.anomaly_metric)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>
    </main>
  );
}

function deriveChangeSummary(items: NonNullable<ChangeTimelineApiBundle["changes"]["items"]>) {
  return items.reduce(
    (summary, item) => {
      if (item.change_type === "release") {
        summary.release_count += 1;
      } else if (item.change_type === "flag") {
        summary.flag_count += 1;
      } else if (item.change_type === "rule") {
        summary.rule_count += 1;
      }

      return summary;
    },
    {
      release_count: 0,
      flag_count: 0,
      rule_count: 0
    }
  );
}

function formatCount(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "0";
}

function formatTraceSummary(type: string | undefined, metric: string | undefined): string {
  if (type && metric) {
    return `${type} anomaly on ${metric}`;
  }

  return metric ?? type ?? "Suspected trace";
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";

  return `${hour12}:${minutes} ${suffix}`;
}
