import { useCallback, useEffect, useState } from "react";
import { TraceOverviewApiError } from "../api/traceOverviewClient";
import { mapTraceOverviewApiBundleToViewModelInput } from "../api/traceOverviewMappers";
import { getTraceOverviewApiBundle } from "../services/traceOverviewApiService";
import type { DemoMode } from "../state/demoMode";
import {
  buildTraceOverviewViewModel,
  type TraceOverviewViewModel
} from "../view-models/traceOverviewViewModel";

type TraceOverviewApiViewModelSnapshot =
  | { status: "loading"; viewModel: null; error: null }
  | { status: "error"; viewModel: null; error: TraceOverviewApiError | Error }
  | { status: "empty"; viewModel: TraceOverviewViewModel | null; error: null }
  | { status: "ready"; viewModel: TraceOverviewViewModel; error: null };

export type TraceOverviewApiViewModelState =
  | (Extract<TraceOverviewApiViewModelSnapshot, { status: "loading" }> & { refetch: () => void })
  | (Extract<TraceOverviewApiViewModelSnapshot, { status: "error" }> & { refetch: () => void })
  | (Extract<TraceOverviewApiViewModelSnapshot, { status: "empty" }> & { refetch: () => void })
  | (Extract<TraceOverviewApiViewModelSnapshot, { status: "ready" }> & { refetch: () => void });

const loadingState: TraceOverviewApiViewModelSnapshot = {
  status: "loading",
  viewModel: null,
  error: null
};

export function useTraceOverviewApiViewModel(
  selectedTraceId?: string,
  demoMode: DemoMode = null
): TraceOverviewApiViewModelState {
  const [state, setState] = useState<TraceOverviewApiViewModelSnapshot>(loadingState);
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setState(loadingState);

    getTraceOverviewApiBundle(selectedTraceId, { demoMode })
      .then((bundle) => {
        if (cancelled) {
          return;
        }

        const viewModelInput = mapTraceOverviewApiBundleToViewModelInput(bundle);
        const viewModel = buildTraceOverviewViewModel(viewModelInput);

        if (!viewModel.selectedScenario || viewModel.reviewCases.length === 0) {
          setState({
            status: "empty",
            viewModel,
            error: null
          });
          return;
        }

        setState({
          status: "ready",
          viewModel,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          viewModel: null,
          error: normalizeError(error)
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTraceId, demoMode, refreshKey]);

  switch (state.status) {
    case "loading":
      return { ...state, refetch };
    case "error":
      return { ...state, refetch };
    case "empty":
      return { ...state, refetch };
    case "ready":
      return { ...state, refetch };
  }
}

function normalizeError(error: unknown): TraceOverviewApiError | Error {
  return error instanceof Error ? error : new Error("Trace overview API request failed");
}
