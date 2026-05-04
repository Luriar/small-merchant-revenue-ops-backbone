export type DemoMode = "m1" | null;

const DEMO_QUERY_PARAM = "demo";

export function resolveDemoMode(search: string): DemoMode {
  const queryValue = new URLSearchParams(search).get(DEMO_QUERY_PARAM);
  return queryValue === "m1" ? "m1" : null;
}
