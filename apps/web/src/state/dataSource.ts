export type DataSource = "mock" | "api";

const DATA_SOURCE_QUERY_PARAM = "data";

export function resolveDataSource(search: string): DataSource {
  const queryValue = new URLSearchParams(search).get(DATA_SOURCE_QUERY_PARAM);
  return queryValue === "api" ? "api" : "mock";
}
