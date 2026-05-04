import type {
  ChangeTimelineApiBundle,
  LinkedIssueApiBundle,
  ReliabilityApiBundle,
  TraceOverviewApiBundle
} from "../api/traceOverviewBundles";
import type {
  ChangeListResponse,
  DashboardOverviewResponse,
  DashboardTimelineResponse,
  IssueListResponse,
  RunDetail,
  RunFailureGroupsResponse,
  RunListResponse,
  RunOverviewResponse,
  TraceListResponse
} from "../api/traceOverviewDtos";
import {
  TraceOverviewApiError,
  fetchChangeDetail,
  fetchChanges,
  fetchChangeTraces,
  fetchDashboardOverview,
  fetchDashboardTimeline,
  fetchIssueDetail,
  fetchIssues,
  fetchIssueTraces,
  fetchRunDetail,
  fetchRuns,
  fetchRunsFailures,
  fetchRunsOverview,
  fetchRunStateLog,
  fetchTraceDetail,
  fetchTraceEvidences,
  fetchTracePrimaryIssue,
  fetchTraces
} from "../api/traceOverviewClient";
import type { DemoMode } from "../state/demoMode";

interface ApiBundleOptions {
  demoMode?: DemoMode;
}

const M1_DEMO_SOURCE = "m1_mvp_demo_seed";
const M1_DEMO_TARGET_SERVICE = "checkout";
const M1_DEMO_LIMIT = 100;

export async function getTraceOverviewApiBundle(
  selectedTraceId?: string,
  options: ApiBundleOptions = {}
): Promise<TraceOverviewApiBundle> {
  if (options.demoMode === "m1") {
    return getM1DemoTraceOverviewApiBundle(selectedTraceId);
  }

  const [dashboardOverview, dashboardTimeline, traces] = await Promise.all([
    fetchDashboardOverview(),
    fetchDashboardTimeline(),
    fetchTraces()
  ]);
  const traceId = selectKnownId(selectedTraceId, traces.items ?? [], (trace) => trace.trace_id);

  if (!traceId) {
    return {
      dashboardOverview,
      dashboardTimeline,
      traces,
      selectedTrace: null,
      selectedTraceEvidences: null,
      selectedTracePrimaryIssue: null,
      selectedTraceChange: null
    };
  }

  const selectedTrace = await fetchTraceDetail(traceId);
  const [selectedTraceEvidences, selectedTracePrimaryIssue, selectedTraceChange] = await Promise.all([
    fetchTraceEvidences(traceId),
    loadOptional(() => fetchTracePrimaryIssue(traceId)),
    selectedTrace.change_id ? loadOptional(() => fetchChangeDetail(selectedTrace.change_id as string)) : null
  ]);

  return {
    dashboardOverview,
    dashboardTimeline,
    traces,
    selectedTrace,
    selectedTraceEvidences,
    selectedTracePrimaryIssue,
    selectedTraceChange
  };
}

async function getM1DemoTraceOverviewApiBundle(
  selectedTraceId?: string
): Promise<TraceOverviewApiBundle> {
  const [changes, issues] = await Promise.all([
    fetchChanges({
      source: M1_DEMO_SOURCE,
      target_service: M1_DEMO_TARGET_SERVICE,
      limit: M1_DEMO_LIMIT
    }),
    fetchIssues({
      source: M1_DEMO_SOURCE,
      limit: M1_DEMO_LIMIT
    })
  ]);
  const selectedChangeId = changes.items?.[0]?.change_id ?? null;
  const traces = selectedChangeId
    ? await fetchTraces({ change_id: selectedChangeId, limit: M1_DEMO_LIMIT })
    : emptyTraceList();
  const traceId = selectKnownId(selectedTraceId, traces.items ?? [], (trace) => trace.trace_id);
  const dashboardOverview = deriveM1DemoDashboardOverview(changes, issues, traces);
  const dashboardTimeline = deriveM1DemoDashboardTimeline(changes);

  if (!traceId) {
    return {
      dashboardOverview,
      dashboardTimeline,
      traces,
      selectedTrace: null,
      selectedTraceEvidences: null,
      selectedTracePrimaryIssue: null,
      selectedTraceChange: null
    };
  }

  const selectedTrace = await fetchTraceDetail(traceId);
  const [selectedTraceEvidences, selectedTracePrimaryIssue, selectedTraceChange] = await Promise.all([
    fetchTraceEvidences(traceId),
    loadOptional(() => fetchTracePrimaryIssue(traceId)),
    selectedTrace.change_id ? loadOptional(() => fetchChangeDetail(selectedTrace.change_id as string)) : null
  ]);

  return {
    dashboardOverview,
    dashboardTimeline,
    traces,
    selectedTrace,
    selectedTraceEvidences,
    selectedTracePrimaryIssue,
    selectedTraceChange
  };
}

async function loadOptional<TValue>(loader: () => Promise<TValue>): Promise<TValue | null> {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof TraceOverviewApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getChangeTimelineApiBundle(
  changeId?: string,
  options: ApiBundleOptions = {}
): Promise<ChangeTimelineApiBundle> {
  const changes = await fetchChanges(options.demoMode === "m1"
    ? {
        source: M1_DEMO_SOURCE,
        target_service: M1_DEMO_TARGET_SERVICE,
        limit: M1_DEMO_LIMIT
      }
    : {});
  const selectedChangeId = selectKnownId(changeId, changes.items ?? [], (change) => change.change_id);

  if (!selectedChangeId) {
    return {
      changes,
      selectedChange: null,
      selectedChangeTraces: null
    };
  }

  const [selectedChange, selectedChangeTraces] = await Promise.all([
    fetchChangeDetail(selectedChangeId),
    fetchChangeTraces(selectedChangeId)
  ]);

  return {
    changes,
    selectedChange,
    selectedChangeTraces
  };
}

export async function getLinkedIssueApiBundle(
  issueId?: string,
  options: ApiBundleOptions = {}
): Promise<LinkedIssueApiBundle> {
  const issues = await fetchIssues(options.demoMode === "m1"
    ? {
        source: M1_DEMO_SOURCE,
        limit: M1_DEMO_LIMIT
      }
    : {});
  const selectedIssueId = selectKnownId(issueId, issues.items ?? [], (issue) => issue.issue_id);

  if (!selectedIssueId) {
    return {
      issues,
      selectedIssue: null,
      selectedIssueTraces: null
    };
  }

  const [selectedIssue, selectedIssueTraces] = await Promise.all([
    fetchIssueDetail(selectedIssueId),
    fetchIssueTraces(selectedIssueId)
  ]);

  return {
    issues,
    selectedIssue,
    selectedIssueTraces
  };
}

export async function getReliabilityApiBundle(
  runId?: string,
  options: ApiBundleOptions = {}
): Promise<ReliabilityApiBundle> {
  if (options.demoMode === "m1") {
    return getM1DemoReliabilityApiBundle(runId);
  }

  const [runsOverview, runsFailures, runs] = await Promise.all([
    fetchRunsOverview(),
    fetchRunsFailures(),
    fetchRuns()
  ]);
  const selectedRunId = selectKnownId(runId, runs.items ?? [], (run) => run.run_id);

  if (!selectedRunId) {
    return {
      runsOverview,
      runsFailures,
      runs,
      selectedRun: null,
      selectedRunStateLog: null
    };
  }

  const [selectedRun, selectedRunStateLog] = await Promise.all([
    fetchRunDetail(selectedRunId),
    fetchRunStateLog(selectedRunId)
  ]);

  return {
    runsOverview,
    runsFailures,
    runs,
    selectedRun,
    selectedRunStateLog
  };
}

async function getM1DemoReliabilityApiBundle(runId?: string): Promise<ReliabilityApiBundle> {
  const allRuns = await fetchRuns({ limit: M1_DEMO_LIMIT });
  const demoRuns = filterM1DemoRuns(allRuns.items ?? allRuns.runs ?? []);
  const runs = withRunItems(allRuns, demoRuns);
  const runsOverview = deriveM1DemoRunOverview(demoRuns);
  const runsFailures = deriveM1DemoRunFailures(demoRuns);
  const selectedRunId = selectKnownId(runId, runs.items ?? [], (run) => run.run_id);

  if (!selectedRunId) {
    return {
      runsOverview,
      runsFailures,
      runs,
      selectedRun: null,
      selectedRunStateLog: null
    };
  }

  const [selectedRun, selectedRunStateLog] = await Promise.all([
    fetchRunDetail(selectedRunId),
    fetchRunStateLog(selectedRunId)
  ]);

  return {
    runsOverview,
    runsFailures,
    runs,
    selectedRun,
    selectedRunStateLog
  };
}

function emptyTraceList(): TraceListResponse {
  return {
    items: [],
    page: {
      limit: M1_DEMO_LIMIT,
      has_more: false,
      next_cursor: null
    }
  };
}

function selectKnownId<TItem>(
  requestedId: string | undefined,
  items: TItem[],
  getId: (item: TItem) => string | null | undefined
): string | null {
  const firstItem = items[0];
  const firstId = firstItem ? getId(firstItem) : null;

  if (!requestedId) {
    return firstId ?? null;
  }

  return items.some((item) => getId(item) === requestedId) ? requestedId : firstId ?? null;
}

function deriveM1DemoDashboardOverview(
  changes: ChangeListResponse,
  issues: IssueListResponse,
  traces: TraceListResponse
): DashboardOverviewResponse {
  const traceItems = traces.items ?? [];
  const anomalyKeys = new Set(
    traceItems.map((trace) => [
      trace.anomaly_type,
      trace.anomaly_metric,
      trace.anomaly_window_start,
      trace.anomaly_window_end
    ].join("|"))
  );

  return {
    scope: {
      service: M1_DEMO_TARGET_SERVICE,
      from: traceItems[0]?.anomaly_window_start ?? changes.items?.[0]?.occurred_at,
      to: traceItems[0]?.anomaly_window_end ?? issues.items?.[0]?.created_at
    },
    kpis: {
      changes: changes.items?.length ?? 0,
      detected_anomaly_patterns: anomalyKeys.size,
      linked_issues: issues.items?.length ?? 0,
      suspected_traces: traceItems.filter((trace) => trace.status === "suspected").length
    },
    chart_context: {
      metric: traceItems[0]?.anomaly_metric ?? "checkout.payment_failed"
    }
  };
}

function deriveM1DemoDashboardTimeline(changes: ChangeListResponse): DashboardTimelineResponse {
  return {
    metric: "checkout.payment_failed",
    series: [],
    change_markers: (changes.items ?? []).map((change) => ({
      change_id: change.change_id,
      title: change.title,
      occurred_at: change.occurred_at
    })),
    anomaly_markers: []
  };
}

function filterM1DemoRuns(runs: RunDetail[]): RunDetail[] {
  return runs.filter((run) => {
    const targetRef = run.target_ref ?? "";
    return targetRef.startsWith("demo-event-") || targetRef.startsWith("demo-dlq-");
  });
}

function withRunItems(source: RunListResponse, runs: RunDetail[]): RunListResponse {
  return {
    ...source,
    items: runs,
    runs,
    page: {
      limit: source.page?.limit ?? M1_DEMO_LIMIT,
      has_more: false,
      next_cursor: null
    }
  };
}

function deriveM1DemoRunOverview(runs: RunDetail[]): RunOverviewResponse {
  const kpis = {
    pending: countRunsByStatus(runs, "pending"),
    processing: countRunsByStatus(runs, "processing"),
    failed: countRunsByStatus(runs, "failed"),
    dlq: countRunsByStatus(runs, "dlq")
  };

  return {
    kpis,
    distribution: [
      { status: "pending", count: kpis.pending },
      { status: "processing", count: kpis.processing },
      { status: "failed", count: kpis.failed },
      { status: "dlq", count: kpis.dlq }
    ]
  };
}

function deriveM1DemoRunFailures(runs: RunDetail[]): RunFailureGroupsResponse {
  const failedRuns = runs.filter((run) => run.status === "failed" || run.status === "dlq");

  if (failedRuns.length === 0) {
    return { groups: [] };
  }

  const latestRun = failedRuns[0];

  return {
    groups: [
      {
        error_class: "demo_failed_runs",
        count: failedRuns.length,
        latest_occurred_at: latestRun.created_at,
        representative_run_type: latestRun.run_type,
        retryable: true
      }
    ]
  };
}

function countRunsByStatus(runs: RunDetail[], status: NonNullable<RunDetail["status"]>): number {
  return runs.filter((run) => run.status === status).length;
}
