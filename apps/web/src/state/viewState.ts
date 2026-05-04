import { isViewState, type ViewState } from "../types/viewState";

const VIEW_STATE_QUERY_PARAM = "state";

interface ViewStateLocation {
  hash: string;
  pathname: string;
  search: string;
}

export function resolveViewState(search: string): ViewState {
  const queryValue = new URLSearchParams(search).get(VIEW_STATE_QUERY_PARAM);
  return isViewState(queryValue) ? queryValue : "ready";
}

export function getReadyStateUrl(location: ViewStateLocation): string {
  const params = new URLSearchParams(location.search);
  params.delete(VIEW_STATE_QUERY_PARAM);

  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
}
