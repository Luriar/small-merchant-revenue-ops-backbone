import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ShellStateView } from "../components/state/ShellStateView";
import {
  TraceOverviewApiError,
  reprocessRun,
  retryRun
} from "../api/traceOverviewClient";
import type { ReliabilityApiBundle } from "../api/traceOverviewBundles";
import type {
  ReprocessTargetKindDto,
  RunDetail,
  RunStatusDto
} from "../api/traceOverviewDtos";
import { useReliabilityApiBundle } from "../hooks/useReliabilityApiBundle";
import type { usePreferences } from "../hooks/usePreferences";
import { formatMessage, translateStatusLabel } from "../i18n/messages";
import type { Translator } from "../i18n/messages";
import type { MessageKey } from "../i18n/messages";
import { resolveDemoMode, type DemoMode } from "../state/demoMode";
import { resolveDataSource, type DataSource } from "../state/dataSource";
import { getReadyStateUrl, resolveViewState } from "../state/viewState";
import type { AppPage } from "../types/navigation";
import type { ViewState } from "../types/viewState";

interface ReliabilityPanelPageProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  preferences: ReturnType<typeof usePreferences>;
}

const statusCards: Array<{ title: MessageKey; value: string }> = [
  { title: "pending", value: "0" },
  { title: "processing", value: "0" },
  { title: "failed", value: "0" },
  { title: "dlq", value: "0" }
];

interface ReliabilityContentProps {
  demoMode: DemoMode;
  preferences: ReturnType<typeof usePreferences>;
}

interface ApiReliabilityReadyContentProps {
  bundle: ReliabilityApiBundle;
  preferences: ReturnType<typeof usePreferences>;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

type NonReadyViewState = Exclude<ViewState, "ready">;

interface ReliabilityDisplayData {
  cards: Array<{ title: MessageKey; value: string }>;
  failureRows: Array<{
    id: string;
    statusKey: MessageKey;
    label: string;
  }>;
  runRows: Array<{
    id: string;
    status: string;
    label: string;
  }>;
  selectedRunId: string;
  selectedRunStatus: string;
  runType: string;
  target: string;
  attempt: string;
  errorClass: string;
  stateLogSummary: string;
  stateLogRows: Array<{
    id: string;
    changedAt: string;
    fromStatus: string;
    toStatus: string;
  }>;
}

type RunActionKind = "retry" | "reprocess";

type RunActionState =
  | { status: "idle" }
  | { status: "loading"; kind: RunActionKind }
  | { status: "success"; kind: RunActionKind; runId: string; replay: boolean }
  | { status: "error"; message: string };

function getInitialViewState(): ViewState {
  return typeof window === "undefined" ? "ready" : resolveViewState(window.location.search);
}

function getInitialDataSource(): DataSource {
  return typeof window === "undefined" ? "mock" : resolveDataSource(window.location.search);
}

function getInitialDemoMode(): DemoMode {
  return typeof window === "undefined" ? null : resolveDemoMode(window.location.search);
}

export function ReliabilityPanelPage({
  activePage,
  onNavigate,
  preferences
}: ReliabilityPanelPageProps) {
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
      headerTitleKey="reliabilityPanelTitle"
      onNavigate={onNavigate}
      preferences={preferences}
    >
      {viewState !== "ready" ? (
        <ReliabilityStateView
          state={viewState}
          t={t}
          onRetry={resetViewState}
          emptyBody={demoMode === "m1" ? t("demoM1EmptyBody") : undefined}
        />
      ) : dataSource === "api" ? (
        <ApiReliabilityContent demoMode={demoMode} preferences={preferences} />
      ) : (
        <StaticReliabilityContent demoMode={demoMode} preferences={preferences} />
      )}
    </AppShell>
  );
}

function ReliabilityStateView({
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
      eyebrow={t("runs")}
      title={t("reliabilityPanelTitle")}
      body={t("reliabilityPanelBody")}
      contextTitle={t("failureGroups")}
      loadingTitle={t("reliabilityLoadingTitle")}
      workbenchTitle={t("runStateLog")}
      emptyBody={emptyBody}
      onRetry={onRetry}
    />
  );
}

function StaticReliabilityContent({ preferences }: ReliabilityContentProps) {
  const { t } = preferences;

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="reliability-panel-title">
        <p className="eyebrow">{t("runs")}</p>
        <h2 id="reliability-panel-title">{t("reliabilityPanelTitle")}</h2>
        <p>{t("reliabilityPanelBody")}</p>
      </section>
      <section className="action-list" aria-label={t("status")}>
        {statusCards.map((card) => (
          <div className="context-module" key={card.title}>
            <h3>{t(card.title)}</h3>
            <p>{card.value}</p>
          </div>
        ))}
      </section>
      <section className="trace-and-workbench" aria-label={t("reliabilityPanelTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="failure-groups-title">
            <h3 id="failure-groups-title">{t("failureGroups")}</h3>
            <p>{t("failureGroupsBody")}</p>
            <div className="compact-list">
              <p>
                <span>{t("failed")}</span>
                <strong>{t("reliabilityContext")}</strong>
              </p>
              <p>
                <span>{t("dlq")}</span>
                <strong>{t("failureGroups")}</strong>
              </p>
            </div>
          </section>
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("runs")}</p>
            <h2>{t("runStateLog")}</h2>
          </div>
          <p>{t("runStateLogBody")}</p>
        </aside>
      </section>
    </main>
  );
}

function ApiReliabilityContent({ demoMode, preferences }: ReliabilityContentProps) {
  const { t } = preferences;
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const apiState = useReliabilityApiBundle(selectedRunId, demoMode);
  const emptyBody = demoMode === "m1" ? t("demoM1EmptyBody") : undefined;

  if (apiState.status !== "ready") {
    return <ReliabilityStateView state={apiState.status} t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  if (!apiState.bundle.selectedRun) {
    return <ReliabilityStateView state="empty" t={t} onRetry={apiState.refetch} emptyBody={emptyBody} />;
  }

  return (
    <ApiReliabilityReadyContent
      bundle={apiState.bundle}
      preferences={preferences}
      onSelectRun={setSelectedRunId}
      onRefresh={apiState.refetch}
    />
  );
}

function ApiReliabilityReadyContent({
  bundle,
  preferences,
  onSelectRun,
  onRefresh
}: ApiReliabilityReadyContentProps) {
  const { t } = preferences;
  const selectedRunId = bundle.selectedRun?.run_id;
  const displayData = mapReliabilityBundleToDisplayData(bundle, t);
  const [actionState, setActionState] = useState<RunActionState>({ status: "idle" });

  useEffect(() => {
    setActionState({ status: "idle" });
  }, [selectedRunId]);

  const handleRetryRun = async () => {
    const runId = bundle.selectedRun?.run_id;

    if (!runId) {
      return;
    }

    setActionState({ status: "loading", kind: "retry" });

    try {
      const result = await retryRun(runId, {
        idempotency_key: createActionIdempotencyKey("retry"),
        reason: "ui_retry_requested"
      });
      setActionState({
        status: "success",
        kind: "retry",
        runId: result.new_run_id ?? "run",
        replay: result.idempotent_replay === true
      });
      window.setTimeout(onRefresh, 600);
    } catch (error) {
      setActionState({
        status: "error",
        message: getSafeActionErrorMessage(error)
      });
    }
  };

  const handleReprocessRun = async () => {
    const selectedRun = bundle.selectedRun;

    if (!selectedRun?.target_ref || !isReprocessTargetKind(selectedRun.target_kind)) {
      return;
    }

    setActionState({ status: "loading", kind: "reprocess" });

    try {
      const result = await reprocessRun({
        idempotency_key: createActionIdempotencyKey("reprocess"),
        target_kind: selectedRun.target_kind,
        target_ref: selectedRun.target_ref,
        reason: "ui_reprocess_requested"
      });
      setActionState({
        status: "success",
        kind: "reprocess",
        runId: result.new_run_id ?? "run",
        replay: result.idempotent_replay === true
      });
      window.setTimeout(onRefresh, 600);
    } catch (error) {
      setActionState({
        status: "error",
        message: getSafeActionErrorMessage(error)
      });
    }
  };

  return (
    <main className="main-workspace">
      <section className="overview-state-panel" aria-labelledby="reliability-panel-title">
        <p className="eyebrow">{t("runs")}</p>
        <h2 id="reliability-panel-title">{t("reliabilityPanelTitle")}</h2>
        <p>{t("reliabilityPanelBody")}</p>
      </section>
      <section className="action-list" aria-label={t("status")}>
        {displayData.cards.map((card) => (
          <div className="context-module" key={card.title}>
            <h3>{t(card.title)}</h3>
            <p>{card.value}</p>
          </div>
        ))}
      </section>
      <section className="trace-and-workbench" aria-label={t("reliabilityPanelTitle")}>
        <div className="trace-column">
          <section className="context-module" aria-labelledby="failure-groups-title">
            <h3 id="failure-groups-title">{t("failureGroups")}</h3>
            <p>{t("failureGroupsBody")}</p>
            <div className="compact-list">
              {displayData.failureRows.map((row) => (
                <p key={row.id}>
                  <span>{t(row.statusKey)}</span>
                  <strong>{row.label}</strong>
                </p>
              ))}
            </div>
          </section>
          {displayData.runRows.length > 0 && (
            <section className="context-module" aria-labelledby="run-list-title">
              <h3 id="run-list-title">{t("runs")}</h3>
              <div className="compact-list">
                {displayData.runRows.map((row) => (
                  <button
                    key={row.id}
                    className={row.id === selectedRunId ? "is-selected" : undefined}
                    type="button"
                    onClick={() => onSelectRun(row.id)}
                  >
                    <span>{row.status}</span>
                    <strong>{row.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="investigation-workbench">
          <div className="workbench-header">
            <p className="eyebrow">{t("runs")}</p>
            <h2>{displayData.selectedRunId}</h2>
          </div>
          <dl>
            <div>
              <dt>{t("status")}</dt>
              <dd>{displayData.selectedRunStatus}</dd>
            </div>
            <div>
              <dt>{t("runType")}</dt>
              <dd>{displayData.runType}</dd>
            </div>
            <div>
              <dt>{t("target")}</dt>
              <dd>{displayData.target}</dd>
            </div>
            <div>
              <dt>{t("attempt")}</dt>
              <dd>{displayData.attempt}</dd>
            </div>
            <div>
              <dt>{t("errorClass")}</dt>
              <dd>{displayData.errorClass}</dd>
            </div>
          </dl>
          <p>{displayData.stateLogSummary}</p>
          <ActionReadiness
            actionState={actionState}
            selectedRun={bundle.selectedRun}
            t={t}
            onReprocessRun={handleReprocessRun}
            onRetryRun={handleRetryRun}
          />
          <section className="workbench-section">
            <h3>{t("recoveryHistory")}</h3>
            {displayData.stateLogRows.length > 0 ? (
              <ol className="recovery-history-list">
                {displayData.stateLogRows.map((row) => (
                  <li key={row.id}>
                    <span>{row.changedAt}</span>
                    <strong>{formatStateLogSummary(row.fromStatus, row.toStatus, t)}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="section-hint">{t("recoveryHistoryEmpty")}</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function mapReliabilityBundleToDisplayData(
  bundle: ReliabilityApiBundle,
  t: Translator
): ReliabilityDisplayData {
  const kpis = bundle.runsOverview.kpis;
  const selectedRun = bundle.selectedRun;
  const stateLogRows = (bundle.selectedRunStateLog?.items ?? []).map((item, index) => ({
    id: `${item.state_log_id ?? item.changed_at ?? "state"}-${index}`,
    changedAt: formatTime(item.changed_at),
    fromStatus: item.from_status ?? "created",
    toStatus: item.to_status ?? "unknown"
  }));

  return {
    cards: [
      { title: "pending", value: formatCount(kpis?.pending) },
      { title: "processing", value: formatCount(kpis?.processing) },
      { title: "failed", value: formatCount(kpis?.failed) },
      { title: "dlq", value: formatCount(kpis?.dlq) }
    ],
    runRows: (bundle.runs.items ?? []).map((run, index) => ({
      id: run.run_id ?? `run-${index}`,
      status: translateStatusLabel(run.status ?? "unknown", t),
      label: `${run.run_type ?? "run"} / ${formatTime(run.created_at)}`
    })),
    failureRows: (bundle.runsFailures.groups ?? []).map((group) => ({
      id: group.error_class ?? group.representative_run_type ?? "failure",
      statusKey: group.retryable ? "retryableReadOnly" : "readOnly",
      label: `${group.error_class ?? "failure"} / ${formatCount(group.count)} runs / ${formatTime(group.latest_occurred_at)}`
    })),
    selectedRunId: selectedRun?.run_id ?? "run",
    selectedRunStatus: translateStatusLabel(selectedRun?.status ?? "unknown", t),
    runType: selectedRun?.run_type ?? "unknown",
    target: formatRunTarget(selectedRun?.target_kind, selectedRun?.target_ref),
    attempt: formatRunAttempt(selectedRun?.attempt),
    errorClass: "n/a",
    stateLogSummary: formatMessage("runStateLogCount", { count: stateLogRows.length }, t),
    stateLogRows
  };
}

function ActionReadiness({
  actionState,
  selectedRun,
  t,
  onReprocessRun,
  onRetryRun
}: {
  actionState: RunActionState;
  selectedRun: RunDetail | null;
  t: Translator;
  onReprocessRun: () => void;
  onRetryRun: () => void;
}) {
  const status = selectedRun?.status;
  const retryable = isRetryableStatus(status);
  const reprocessApplicable = isReprocessApplicable(selectedRun);
  const loadingKind = actionState.status === "loading" ? actionState.kind : null;
  const guidanceKey = getActionGuidanceKey(selectedRun);

  return (
    <section className="workbench-section action-readiness">
      <h3>{t("actionReadiness")}</h3>
      <p className="section-hint">{t(guidanceKey)}</p>
      <div className="recovery-action-list">
        {retryable ? (
          <button
            className="recovery-action-button"
            type="button"
            disabled={loadingKind !== null}
            onClick={onRetryRun}
          >
            {loadingKind === "retry" ? t("processing") : t("retryRunAction")}
          </button>
        ) : null}
        {reprocessApplicable ? (
          <button
            className="recovery-action-button"
            type="button"
            disabled={loadingKind !== null}
            onClick={onReprocessRun}
          >
            {loadingKind === "reprocess" ? t("processing") : t("reprocessRunAction")}
          </button>
        ) : null}
      </div>
      <ActionFeedback actionState={actionState} t={t} />
    </section>
  );
}

function ActionFeedback({
  actionState,
  t
}: {
  actionState: RunActionState;
  t: Translator;
}) {
  if (actionState.status === "idle" || actionState.status === "loading") {
    return null;
  }

  if (actionState.status === "error") {
    return (
      <p className="action-feedback is-error">
        {formatMessage("actionRequestFailed", { message: actionState.message }, t)}
      </p>
    );
  }

  const key = getActionSuccessMessageKey(actionState);

  return (
    <p className="action-feedback is-success">
      {formatMessage(key, { runId: actionState.runId }, t)}
    </p>
  );
}

function formatCount(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "0";
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

function formatRunTarget(kind: string | undefined, ref: string | null | undefined): string {
  if (!kind && !ref) {
    return "n/a";
  }

  return `${kind ?? "target"}${ref ? ` / ${ref}` : ""}`;
}

function formatRunAttempt(attempt: number | undefined): string {
  if (typeof attempt !== "number") {
    return "n/a";
  }

  return String(attempt);
}

function formatStateLogSummary(
  fromStatus: string | null | undefined,
  toStatus: string | undefined,
  t: Translator
): string {
  return `${formatStateLogStatus(fromStatus, t)} -> ${formatStateLogStatus(toStatus, t)}`;
}

function formatStateLogStatus(status: string | null | undefined, t: Translator): string {
  if (!status) {
    return "created";
  }

  return translateStatusLabel(status, t);
}

function isRetryableStatus(status: RunStatusDto | undefined): boolean {
  return status === "failed" || status === "dlq";
}

function isReprocessApplicable(run: RunDetail | null): run is RunDetail & {
  target_kind: ReprocessTargetKindDto;
  target_ref: string;
} {
  return (
    run?.run_type !== "reprocess"
    && isRetryableStatus(run?.status)
    && isReprocessTargetKind(run?.target_kind)
    && typeof run.target_ref === "string"
    && run.target_ref.trim().length > 0
  );
}

function isReprocessTargetKind(value: string | undefined): value is ReprocessTargetKindDto {
  return value === "dlq_batch" || value === "event_batch";
}

function getActionGuidanceKey(run: RunDetail | null): MessageKey {
  if (run?.status === "pending" || run?.status === "processing") {
    return "pendingRunGuidance";
  }

  if (isRetryableStatus(run?.status)) {
    return "retryReadyBody";
  }

  if (run?.run_type === "reprocess" || isReprocessApplicable(run)) {
    return "reprocessReadyBody";
  }

  return "reprocessInsufficientTarget";
}

function getActionSuccessMessageKey(
  actionState: Extract<RunActionState, { status: "success" }>
): MessageKey {
  if (actionState.kind === "retry") {
    return actionState.replay ? "retryReplay" : "retrySuccess";
  }

  return actionState.replay ? "reprocessReplay" : "reprocessSuccess";
}

function createActionIdempotencyKey(kind: RunActionKind): string {
  const randomPart = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `traceops-ui-${kind}-${Date.now()}-${randomPart}`;
}

function getSafeActionErrorMessage(error: unknown): string {
  if (error instanceof TraceOverviewApiError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "request failed";
}
