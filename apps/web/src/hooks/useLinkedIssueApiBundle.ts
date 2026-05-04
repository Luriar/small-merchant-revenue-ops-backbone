import { useCallback, useEffect, useState } from "react";
import type { TraceOverviewApiError } from "../api/traceOverviewClient";
import type { LinkedIssueApiBundle } from "../api/traceOverviewBundles";
import { getLinkedIssueApiBundle } from "../services/traceOverviewApiService";
import type { DemoMode } from "../state/demoMode";

type LinkedIssueApiBundleSnapshot =
  | { status: "loading"; bundle: null; error: null }
  | { status: "error"; bundle: null; error: TraceOverviewApiError | Error }
  | { status: "empty"; bundle: LinkedIssueApiBundle | null; error: null }
  | { status: "ready"; bundle: LinkedIssueApiBundle; error: null };

export type LinkedIssueApiBundleState =
  | (Extract<LinkedIssueApiBundleSnapshot, { status: "loading" }> & { refetch: () => void })
  | (Extract<LinkedIssueApiBundleSnapshot, { status: "error" }> & { refetch: () => void })
  | (Extract<LinkedIssueApiBundleSnapshot, { status: "empty" }> & { refetch: () => void })
  | (Extract<LinkedIssueApiBundleSnapshot, { status: "ready" }> & { refetch: () => void });

const loadingState: LinkedIssueApiBundleSnapshot = {
  status: "loading",
  bundle: null,
  error: null
};

export function useLinkedIssueApiBundle(
  issueId?: string,
  demoMode: DemoMode = null
): LinkedIssueApiBundleState {
  const [state, setState] = useState<LinkedIssueApiBundleSnapshot>(loadingState);
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setState(loadingState);

    getLinkedIssueApiBundle(issueId, { demoMode })
      .then((bundle) => {
        if (cancelled) {
          return;
        }

        if (!bundle.selectedIssue && (bundle.issues.items?.length ?? 0) === 0) {
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
  }, [issueId, demoMode, refreshKey]);

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
  return error instanceof Error ? error : new Error("Linked issue API request failed");
}
