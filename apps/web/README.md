# TraceOps Web

TraceOps is a traceability-first product operations investigation workbench. The frontend is currently a static, mock-backed MVP surface for understanding product changes, anomaly signals, linked issues, evidence, and follow-up context.

## Screens

- Traceability Overview: completed main investigation screen.
- Change Timeline: static shell for product, flag, and rule change review.
- Linked Issue View: static shell for issue-centric investigation.
- Reliability Panel: static shell for run status, failed runs, DLQ, and recovery context.

The Evidence nav item remains inactive. Do not build an Evidence Catalog until that scope is explicitly opened.

## Data Path

The active data path is:

```text
mockTraceData -> traceOverviewMockService -> traceOverviewViewModel -> pages/components
```

Dev-only API integration scaffolding exists for controlled local testing:

- `src/api/traceOverviewDtos.ts`
- `src/api/traceOverviewMappers.ts`
- `src/api/traceOverviewPaths.ts`
- `src/api/traceOverviewClient.ts`
- `src/api/traceOverviewBundles.ts`
- `src/services/traceOverviewApiService.ts`
- `src/hooks/useTraceOverviewApiViewModel.ts`

`traceOverviewPaths.ts` contains relative read-path endpoint builders aligned with overview, change, issue, and run API contracts. It is not a fetch client and does not add runtime API behavior.

`traceOverviewClient.ts` is a read-only API client used only by dev-only `?data=api` mode. Default screen rendering still uses the mock/static paths.

`traceOverviewBundles.ts` owns DTO-level bundle types shared by the API service and mapper.

`traceOverviewApiService.ts` composes read-only API client calls into DTO bundles for dev-only API mode. Future production integration should keep passing those bundles through mapper/view-model boundaries, not directly into visual components.

API bundles can be converted through `traceOverviewMappers.ts` before entering the view-model boundary. DTOs should not be passed directly into visual components.

`useTraceOverviewApiViewModel.ts` loads a Trace Overview API bundle, maps it, and builds the existing view model for dev-only `?data=api` mode. `useChangeTimelineApiBundle.ts`, `useLinkedIssueApiBundle.ts`, and `useReliabilityApiBundle.ts` do the same lifecycle work for the Change Timeline, Linked Issue, and Reliability shells at the DTO bundle level.

The DTO mapper explicitly handles API `rule_match` evidence without changing the current UI evidence model.

When real API integration starts, connect through the service/repository boundary. Keep UI normalization in the view-model layer, and do not pass API DTOs directly into visual components.

The default Traceability Overview, Change Timeline, Linked Issue View, and Reliability Panel data sources are mock-backed. `?data=api` enables dev-only API-backed rendering for those screens through the prepared hooks. `?state=` remains a manual QA override and takes precedence over either data source. API mode requires the local API server to be available through the Vite `/api` proxy.

API bundle loading intentionally uses fail-fast `Promise.all` behavior for the MVP/dev-only path. Partial degraded section rendering is deferred.

## View States

The Traceability Overview supports manual state testing through the `state` query parameter:

- `?state=ready`
- `?state=loading`
- `?state=empty`
- `?state=error`

Invalid state values fall back to `ready`.

Data source testing:

- default or `?data=mock`: mock-backed UI
- `?data=api`: dev-only API-backed read mode
- invalid `data` values fall back to mock

## Theme And Language

Theme preferences:

- Auto
- Light
- Dark

Language preferences:

- Auto
- English
- Korean

Only UI chrome is localized. Mock scenario data remains English.

## Navigation

Navigation uses local `AppPage` state. React Router is not installed or used yet.

Left-nav page switching clears only the `state` query parameter so manual state URLs do not persist when returning to Traceability.

## Locked MVP Constraints

- No rollback controls.
- No kill switch controls.
- No rollout reduction controls.
- No flag reduction controls.
- No production destructive controls.
- No production API wiring beyond the dev-only read mode.
- No auth, backend, routing library, external libraries, or environment variables in the active UI data path.
- Do not implement actual retry/reprocess behavior.
- Do not implement issue status mutation.
- Do not add issue assignment, notification, or mutation controls.
- Keep Reliability API mode read-only; do not add run retry, reprocess, replay, DLQ drain, or state mutation controls.
- Keep the Traceability Overview visual polish locked.

## Development Commands

```bash
npm --prefix apps/web run dev -- --host 127.0.0.1
npm --prefix apps/web run check
npm --prefix apps/web run lint
npm --prefix apps/web run build
```
