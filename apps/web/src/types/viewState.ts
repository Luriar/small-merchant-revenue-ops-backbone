export type ViewState = "loading" | "empty" | "error" | "ready";

export const viewStates: readonly ViewState[] = ["loading", "empty", "error", "ready"];

const viewStatesSet = new Set<ViewState>(viewStates);

export function isViewState(value: string | null): value is ViewState {
  return viewStatesSet.has(value as ViewState);
}
