import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ShellStateView } from "../components/state/ShellStateView";
import type { LinkedIssueApiBundle } from "../api/traceOverviewBundles";
import { useLinkedIssueApiBundle } from "../hooks/useLinkedIssueApiBundle";
import type { usePreferences } from "../hooks/usePreferences";
import type { Translator } from "../i18n/messages";
import { resolveDemoMode, type DemoMode } from "../state/demoMode";
import { resolveDataSource, type DataSource } from "../state/dataSource";
import { getReadyStateUrl, resolveViewState } from "../state/viewState";
import type { AppPage } from "../types/navigation";
import type { ViewState } from "../types/viewState";

interface LinkedIssueViewPageProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  preferences: ReturnType<typeof usePreferences>;
}

interface LinkedIssueContentProps {
  demoMode: DemoMode;
  preferences: ReturnType<typeof usePreferences>;
}

interface ApiLinkedIssueReadyContentProps {
  bundle: LinkedIssueApiBundle;
  preferences: ReturnType<typeof usePreferences>;
  onSelectIssue: (issueId: string) => void;
}

type NonReadyViewState = Exclude<ViewState, "ready">;

interface LinkedIssueDisplayData {
  selectedIssueLabel: string;
  selectedIssueTechnicalId: string;
  summary: string;
  issueFamily: string;
  status: string;
  source: string;
  affectedVariation: string;
  keywords: string;
  linkedTraceCount: string;
  issueRows: Array<{
    id: string;
    status: string;
    label: string;
  }>;
  linkedTraceRows: Array<{
    id: string;
    summary: string;
  }>;
}

function getInitialViewState(): ViewState {
  return typeof window === "undefined" ? "ready" : resolveViewState(window.location.search);
}

function getInitialDataSource(): DataSource {
  return typeof window === "undefined" ? "mock" : resolveDataSource(window.location.search);
}

function getInitialDemoMode(): DemoMode {
  return typeof window === "undefined" ? null : resolveDemoMode(window.location.search);
}

export function LinkedIssueViewPage({
  activePage,
  onNavigate,
  preferences
}: LinkedIssueViewPageProps) {
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
      headerTitleKey="linkedIssueViewTitle"
      onNavigate={onNavigate}
      preferences={preferences}
    >
      {viewState !== "ready" ? (
        <LinkedIssueStateView
          state={viewState}
          t={t}
          onRetry={resetViewState}
          emptyBody={demoMode === "m1" ? t("demoM1EmptyBody") : undefined}
        />
      ) : dataSource === "api" ? (
        <ApiLinkedIssueContent demoMode={demoMode} preferences={preferences} />
      ) : (
        <StaticLinkedIssueContent demoMode={demoMode} preferences={preferences} />
      )}
    </AppShell>
  );
}

function LinkedIssueStateView({
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
      eyebrow={t("issues")}
      title={t("linkedIssueViewTitle")}
      body={t("linkedIssueViewBody")}
      contextTitle={t("issueListPlaceholderTitle")}
      loadingTitle={t("linkedIssueLoadingTitle")}
      workbenchTitle={t("selectedIssueDetailTitle")}
      emptyBody={emptyBody}
      onRetry={onRetry}
    />
  );
}

function StaticLinkedIssueContent({ preferences }: LinkedIssueContentProps) {
  const { t } = preferences;

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="linked-issue-view-title">
        <p className="eyebrow">{t("issues")}</p>
        <h2 id="linked-issue-view-title">{t("linkedIssueViewTitle")}</h2>
        <p>{t("linkedIssueViewBody")}</p>
      </section>
      <section className="trace-and-workbench" aria-label={t("linkedIssueViewTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="issue-list-placeholder-title">
            <h3 id="issue-list-placeholder-title">{t("issueListPlaceholderTitle")}</h3>
            <p>{t("issueListPlaceholderBody")}</p>
            <div className="compact-list">
              <p>
                <span>{t("openStatus")}</span>
                <strong>{t("linkedIssue")}</strong>
              </p>
              <p>
                <span>{t("investigatingStatus")}</span>
                <strong>{t("suspectedTrace")}</strong>
              </p>
              <p>
                <span>{t("evidence")}</span>
                <strong>{t("linkedTracesEvidenceTitle")}</strong>
              </p>
            </div>
          </section>
          <section className="context-module" aria-labelledby="linked-traces-evidence-title">
            <h3 id="linked-traces-evidence-title">{t("linkedTracesEvidenceTitle")}</h3>
            <p>{t("linkedTracesEvidenceBody")}</p>
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("issueSummary")}</p>
            <h2>{t("selectedIssueDetailTitle")}</h2>
          </div>
          <p>{t("selectedIssueDetailBody")}</p>
        </aside>
      </section>
    </main>
  );
}

function ApiLinkedIssueContent({ demoMode, preferences }: LinkedIssueContentProps) {
  const { t } = preferences;
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>(undefined);
  const apiState = useLinkedIssueApiBundle(selectedIssueId, demoMode);
  const emptyBody = demoMode === "m1" ? t("demoM1EmptyBody") : undefined;

  if (apiState.status !== "ready") {
    return <LinkedIssueStateView state={apiState.status} t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  if (!apiState.bundle.selectedIssue) {
    return <LinkedIssueStateView state="empty" t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  return (
    <ApiLinkedIssueReadyContent
      bundle={apiState.bundle}
      preferences={preferences}
      onSelectIssue={setSelectedIssueId}
    />
  );
}

function ApiLinkedIssueReadyContent({
  bundle,
  preferences,
  onSelectIssue
}: ApiLinkedIssueReadyContentProps) {
  const { t } = preferences;
  const selectedIssueId = bundle.selectedIssue?.issue_id;
  const displayData = mapLinkedIssueBundleToDisplayData(bundle);

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="linked-issue-view-title">
        <p className="eyebrow">{t("issues")}</p>
        <h2 id="linked-issue-view-title">{displayData.selectedIssueLabel}</h2>
        <p>{displayData.summary}</p>
      </section>
      <section className="trace-and-workbench" aria-label={t("linkedIssueViewTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="issue-list-placeholder-title">
            <h3 id="issue-list-placeholder-title">{t("issueListPlaceholderTitle")}</h3>
            <p>{displayData.linkedTraceCount}</p>
            <div className="compact-list">
              {displayData.issueRows.map((row) => (
                <button
                  key={row.id}
                  className={row.id === selectedIssueId ? "is-selected" : undefined}
                  type="button"
                  onClick={() => { if (row.id) onSelectIssue(row.id); }}
                >
                  <span>{row.status}</span>
                  <strong>{row.label}</strong>
                </button>
              ))}
            </div>
          </section>
          <section className="context-module" aria-labelledby="linked-traces-evidence-title">
            <h3 id="linked-traces-evidence-title">{t("linkedTracesEvidenceTitle")}</h3>
            <p>{t("linkedTracesEvidenceBody")}</p>
            <dl>
              {displayData.linkedTraceRows.map((trace) => (
                <div key={trace.id}>
                  <dt>{trace.id}</dt>
                  <dd>{trace.summary}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("issueSummary")}</p>
            <h2>{displayData.selectedIssueLabel}</h2>
          </div>
          <dl>
            <div>
              <dt>{t("issueId")}</dt>
              <dd>{displayData.selectedIssueTechnicalId}</dd>
            </div>
            <div>
              <dt>{t("issueFamily")}</dt>
              <dd>{displayData.issueFamily}</dd>
            </div>
            <div>
              <dt>{t("status")}</dt>
              <dd>{displayData.status}</dd>
            </div>
            <div>
              <dt>{t("source")}</dt>
              <dd>{displayData.source}</dd>
            </div>
            <div>
              <dt>{t("affectedVariation")}</dt>
              <dd>{displayData.affectedVariation}</dd>
            </div>
            <div>
              <dt>{t("keywords")}</dt>
              <dd>{displayData.keywords}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}

function mapLinkedIssueBundleToDisplayData(bundle: LinkedIssueApiBundle): LinkedIssueDisplayData {
  const selectedIssue = bundle.selectedIssue;
  const selectedIssueLabel = formatIssueLabel(
    selectedIssue?.summary,
    selectedIssue?.issue_id
  );
  const linkedTraceRows = (bundle.selectedIssueTraces?.items ?? []).map((trace) => ({
    id: trace.trace_id ?? "trace",
    summary: formatTraceSummary(trace.anomaly_type, trace.anomaly_metric)
  }));

  return {
    selectedIssueLabel,
    selectedIssueTechnicalId: selectedIssue?.issue_id ?? "n/a",
    summary: selectedIssue?.summary ?? "Issue summary unavailable",
    issueFamily: selectedIssue?.issue_family ?? "Unclassified",
    status: selectedIssue?.status ?? "unknown",
    source: selectedIssue?.source ?? "unknown",
    affectedVariation: formatPresence(selectedIssue?.affected_variation_present),
    keywords: formatCount(selectedIssue?.keywords_count),
    linkedTraceCount: `${linkedTraceRows.length} linked trace${linkedTraceRows.length === 1 ? "" : "s"}`,
    issueRows: (bundle.issues.items ?? []).map((issue) => ({
      id: issue.issue_id ?? issue.summary ?? "issue",
      status: issue.status ?? "unknown",
      label: formatIssueLabel(issue.summary, issue.issue_id)
    })),
    linkedTraceRows
  };
}

function formatIssueLabel(summary: string | undefined, issueId: string | undefined): string {
  return summary ?? issueId ?? "Issue";
}

function formatPresence(isPresent: boolean | undefined): string {
  return isPresent === true ? "present" : "n/a";
}

function formatCount(count: number | undefined): string {
  return typeof count === "number" && count > 0 ? String(count) : "n/a";
}

function formatTraceSummary(type: string | undefined, metric: string | undefined): string {
  if (type && metric) {
    return `${type} anomaly on ${metric}`;
  }

  return metric ?? type ?? "Suspected trace";
}
