import { useEffect, useMemo, useRef, useState } from "react";
import { OperatorBriefing } from "../components/briefing/OperatorBriefing";
import { ContextModules } from "../components/context/ContextModules";
import { AppShell } from "../components/layout/AppShell";
import { TraceOverviewStateView } from "../components/state/TraceOverviewStateView";
import { TraceEvidenceSpine } from "../components/trace-spine/TraceEvidenceSpine";
import { InvestigationWorkbench } from "../components/workbench/InvestigationWorkbench";
import { useTraceOverviewApiViewModel } from "../hooks/useTraceOverviewApiViewModel";
import { getTraceOverviewMockData } from "../services/traceOverviewMockService";
import type { usePreferences } from "../hooks/usePreferences";
import { resolveDemoMode, type DemoMode } from "../state/demoMode";
import { resolveDataSource, type DataSource } from "../state/dataSource";
import { getReadyStateUrl, resolveViewState } from "../state/viewState";
import type { AppPage } from "../types/navigation";
import type { EvidenceType, TraceStageId } from "../types/trace";
import type { ViewState } from "../types/viewState";
import {
  buildTraceOverviewViewModel,
  type TraceOverviewViewModel
} from "../view-models/traceOverviewViewModel";

interface TraceabilityOverviewPageProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  preferences: ReturnType<typeof usePreferences>;
}

interface TraceOverviewPageShellProps extends TraceabilityOverviewPageProps {
  demoMode: DemoMode;
  onRetry: () => void;
}

interface TraceOverviewReadyContentProps {
  viewModel: TraceOverviewViewModel;
  t: ReturnType<typeof usePreferences>["t"];
  onSelectTrace: (traceId: string) => void;
  pageSelectedId?: string | null;
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

const traceOverviewData = getTraceOverviewMockData();

export function TraceabilityOverviewPage({
  activePage,
  onNavigate,
  preferences
}: TraceabilityOverviewPageProps) {
  const [viewState, setViewState] = useState<ViewState>(getInitialViewState);
  const [dataSource, setDataSource] = useState<DataSource>(getInitialDataSource);
  const [demoMode, setDemoMode] = useState<DemoMode>(getInitialDemoMode);
  const { t } = preferences;

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

  if (viewState !== "ready") {
    const emptyBody = demoMode === "m1" ? t("demoM1EmptyBody") : undefined;

    return (
      <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
        <TraceOverviewStateView
          state={viewState}
          t={t}
          onRetry={resetViewState}
          emptyBody={emptyBody}
        />
      </AppShell>
    );
  }

  if (dataSource === "api") {
    return (
      <ApiTraceabilityOverviewPage
        activePage={activePage}
        demoMode={demoMode}
        onNavigate={onNavigate}
        preferences={preferences}
        onRetry={resetViewState}
      />
    );
  }

  return (
    <MockTraceabilityOverviewPage
      activePage={activePage}
      demoMode={demoMode}
      onNavigate={onNavigate}
      preferences={preferences}
      onRetry={resetViewState}
    />
  );
}

function MockTraceabilityOverviewPage({
  activePage,
  demoMode,
  onNavigate,
  preferences,
  onRetry
}: TraceOverviewPageShellProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    traceOverviewData.defaultTraceId
  );
  const viewModel = useMemo(() => {
    return buildTraceOverviewViewModel({
      defaultTraceId: traceOverviewData.defaultTraceId,
      reviewCases: traceOverviewData.reviewCases,
      selectedTraceId,
      traceScenarios: traceOverviewData.traceScenarios
    });
  }, [selectedTraceId]);

  if (!viewModel.selectedScenario || !viewModel.selectedTrace || !viewModel.workbenchDetail) {
    return (
      <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
        <TraceOverviewStateView state="empty" t={preferences.t} onRetry={onRetry} />
      </AppShell>
    );
  }

  return (
    <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
      <TraceOverviewReadyContent
        viewModel={viewModel}
        t={preferences.t}
        onSelectTrace={setSelectedTraceId}
      />
    </AppShell>
  );
}

function ApiTraceabilityOverviewPage({
  activePage,
  demoMode,
  onNavigate,
  preferences
}: TraceOverviewPageShellProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>(undefined);
  const apiState = useTraceOverviewApiViewModel(selectedTraceId, demoMode);
  const lastReadyRef = useRef<TraceOverviewViewModel | null>(null);
  const emptyBody = demoMode === "m1" ? preferences.t("demoM1EmptyBody") : undefined;

  if (apiState.status === "ready") {
    lastReadyRef.current = apiState.viewModel;
  }

  if (
    apiState.status === "error"
    || apiState.status === "empty"
    || (apiState.status === "loading" && lastReadyRef.current === null)
  ) {
    return (
      <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
        <TraceOverviewStateView
          state={apiState.status}
          t={preferences.t}
          onRetry={apiState.refetch}
          emptyBody={emptyBody}
        />
      </AppShell>
    );
  }

  const displayViewModel = apiState.status === "ready" ? apiState.viewModel : lastReadyRef.current!;

  if (!displayViewModel.selectedScenario || !displayViewModel.selectedTrace || !displayViewModel.workbenchDetail) {
    return (
      <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
        <TraceOverviewStateView
          state="empty"
          t={preferences.t}
          onRetry={apiState.refetch}
          emptyBody={emptyBody}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activePage={activePage} demoMode={demoMode} onNavigate={onNavigate} preferences={preferences}>
      <TraceOverviewReadyContent
        viewModel={displayViewModel}
        t={preferences.t}
        onSelectTrace={setSelectedTraceId}
        pageSelectedId={selectedTraceId ?? null}
      />
    </AppShell>
  );
}

function TraceOverviewReadyContent({
  viewModel,
  t,
  onSelectTrace,
  pageSelectedId
}: TraceOverviewReadyContentProps) {
  const selectedTrace = viewModel.selectedTrace;
  const workbenchDetail = viewModel.workbenchDetail;
  const effectiveSelectedId = viewModel.reviewCases.some((reviewCase) => reviewCase.id === pageSelectedId)
    ? pageSelectedId ?? null
    : viewModel.selectedTraceId;
  const [hoveredStageId, setHoveredStageId] = useState<TraceStageId | null>(null);
  const [hoveredEvidenceType, setHoveredEvidenceType] = useState<EvidenceType | null>(null);
  const [focusedEvidenceId, setFocusedEvidenceId] = useState<string | null>(null);
  const activeStageIds = hoveredEvidenceType
    ? getTraceStagesForEvidence(viewModel, hoveredEvidenceType)
    : hoveredStageId
      ? [hoveredStageId]
      : [];
  const activeEvidenceTypes = hoveredStageId
    ? getTraceEvidenceForStage(viewModel, hoveredStageId)
    : hoveredEvidenceType
      ? [hoveredEvidenceType]
      : [];

  if (!selectedTrace || !workbenchDetail) {
    return null;
  }

  const link = viewModel.link;
  const confidenceTier = link?.trace.confidenceTier ?? "weak";
  const selectedTraceIdShort = link?.trace.idShort ?? viewModel.selectedTraceId ?? "";

  return (
    <main className="main-workspace">
      <OperatorBriefing
        reviewCases={viewModel.reviewCases}
        selectedTraceId={effectiveSelectedId}
        t={t}
        onSelectTrace={(traceId) => {
          onSelectTrace(traceId);
          setHoveredStageId(null);
          setHoveredEvidenceType(null);
          setFocusedEvidenceId(null);
        }}
      />
      <section className="trace-and-workbench" aria-label={t("traceInvestigationWorkspace")}>
        <div className="trace-column">
          <TraceEvidenceSpine
            selectedTraceId={viewModel.selectedTraceId}
            selectedTraceIdShort={selectedTraceIdShort}
            selectedCase={selectedTrace}
            stages={viewModel.spineStages}
            evidenceFactors={viewModel.evidenceFactors}
            activeStageIds={activeStageIds}
            activeEvidenceTypes={activeEvidenceTypes}
            focusedEvidenceId={focusedEvidenceId}
            confidenceTier={confidenceTier}
            t={t}
            onStageHover={setHoveredStageId}
            onEvidenceHover={setHoveredEvidenceType}
            onEvidenceFocus={setFocusedEvidenceId}
          />
          <ContextModules
            timeline={viewModel.contextModules.timeline}
            signals={viewModel.contextModules.signals}
            reliability={viewModel.contextModules.reliability}
            t={t}
          />
        </div>
        <InvestigationWorkbench
          evidenceCount={viewModel.evidenceFactors.length}
          selectedCase={workbenchDetail}
          link={link}
          t={t}
        />
      </section>
    </main>
  );
}

function getTraceStagesForEvidence(
  viewModel: TraceOverviewViewModel,
  evidenceType: EvidenceType
): TraceStageId[] {
  return viewModel.evidenceFactors.find((factor) => factor.id === evidenceType)?.relatedStages ?? [];
}

function getTraceEvidenceForStage(
  viewModel: TraceOverviewViewModel,
  stageId: TraceStageId
): EvidenceType[] {
  return viewModel.evidenceFactors
    .filter((factor) => factor.relatedStages.includes(stageId))
    .map((factor) => factor.id);
}
