import { useCallback, useEffect, useState } from "react";
import type { TraceOverviewApiError } from "../api/traceOverviewClient";
import type { ChangeTimelineApiBundle } from "../api/traceOverviewBundles";
import { getChangeTimelineApiBundle } from "../services/traceOverviewApiService";
import type { DemoMode } from "../state/demoMode";

type ChangeTimelineApiBundleSnapshot =
  | { status: "loading"; bundle: null; error: null }
  | { status: "error"; bundle: null; error: TraceOverviewApiError | Error }
  | { status: "empty"; bundle: ChangeTimelineApiBundle | null; error: null }
  | { status: "ready"; bundle: ChangeTimelineApiBundle; error: null };

export type ChangeTimelineApiBundleState =
  | (Extract<ChangeTimelineApiBundleSnapshot, { status: "loading" }> & { refetch: () => void })
  | (Extract<ChangeTimelineApiBundleSnapshot, { status: "error" }> & { refetch: () => void })
  | (Extract<ChangeTimelineApiBundleSnapshot, { status: "empty" }> & { refetch: () => void })
  | (Extract<ChangeTimelineApiBundleSnapshot, { status: "ready" }> & { refetch: () => void });

const loadingState: ChangeTimelineApiBundleSnapshot = {
  status: "loading",
  bundle: null,
  error: null
};

export function useChangeTimelineApiBundle(
  changeId?: string,
  demoMode: DemoMode = null
): ChangeTimelineApiBundleState {
  const [state, setState] = useState<ChangeTimelineApiBundleSnapshot>(loadingState);
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setState(loadingState);

    getChangeTimelineApiBundle(changeId, { demoMode })
      .then((bundle) => {
        if (cancelled) {
          return;
        }

        if (!bundle.selectedChange && (bundle.changes.items?.length ?? 0) === 0) {
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
  }, [changeId, demoMode, refreshKey]);

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
  return error instanceof Error ? error : new Error("Change timeline API request failed");
}
