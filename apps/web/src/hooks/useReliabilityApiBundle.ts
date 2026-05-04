import { useCallback, useEffect, useState } from "react";
import type { TraceOverviewApiError } from "../api/traceOverviewClient";
import type { ReliabilityApiBundle } from "../api/traceOverviewBundles";
import { getReliabilityApiBundle } from "../services/traceOverviewApiService";
import type { DemoMode } from "../state/demoMode";

type ReliabilityApiBundleSnapshot =
  | { status: "loading"; bundle: null; error: null }
  | { status: "error"; bundle: null; error: TraceOverviewApiError | Error }
  | { status: "empty"; bundle: ReliabilityApiBundle | null; error: null }
  | { status: "ready"; bundle: ReliabilityApiBundle; error: null };

export type ReliabilityApiBundleState =
  | (Extract<ReliabilityApiBundleSnapshot, { status: "loading" }> & { refetch: () => void })
  | (Extract<ReliabilityApiBundleSnapshot, { status: "error" }> & { refetch: () => void })
  | (Extract<ReliabilityApiBundleSnapshot, { status: "empty" }> & { refetch: () => void })
  | (Extract<ReliabilityApiBundleSnapshot, { status: "ready" }> & { refetch: () => void });

const loadingState: ReliabilityApiBundleSnapshot = {
  status: "loading",
  bundle: null,
  error: null
};

export function useReliabilityApiBundle(
  runId?: string,
  demoMode: DemoMode = null
): ReliabilityApiBundleState {
  const [state, setState] = useState<ReliabilityApiBundleSnapshot>(loadingState);
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setState(loadingState);

    getReliabilityApiBundle(runId, { demoMode })
      .then((bundle) => {
        if (cancelled) {
          return;
        }

        if (!bundle.selectedRun && (bundle.runs.items?.length ?? 0) === 0) {
          setState({
            status: "empty",
            bundle,
            error: null
          });
          return;
        }

        setState({
          status: "ready",
          bundle,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          bundle: null,
          error: normalizeError(error)
        });
      });

    return () => {
      cancelled = true;
    };
  }, [runId, demoMode, refreshKey]);

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
  return error instanceof Error ? error : new Error("Reliability API request failed");
}
