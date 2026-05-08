import { SCENARIO, DEFAULT_STATUSES } from './revenueCockpitCopy';
import type {
  Scenario,
  ActionStatuses,
  ActionStatus,
  CauseCandidate,
  RcAction,
  SignalStrength,
} from './revenueCockpitTypes';

export interface RevenueApiPayload {
  briefs?: unknown[];
  anomalies?: unknown[];
  actions?: unknown[];
  context?: unknown[];
  pipelineMeta?: Record<string, unknown>;
}

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecordList(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fmtQuarter(period: string, lang: 'ko' | 'en'): string {
  const normalized = period.toLowerCase();
  if (normalized === 'lowest observed day' || normalized === 'observed minimum day') {
    return lang === 'ko' ? '최저 관측일' : 'observed minimum day';
  }
  if (normalized === 'uploaded revenue facts') {
    return lang === 'ko' ? '등록 매출 데이터' : 'uploaded revenue facts';
  }
  if (normalized === 'latest upload') {
    return lang === 'ko' ? '최근 등록 데이터' : 'latest upload';
  }
  const match = period.match(/^(\d{4})Q([1-4])$/);
  if (!match) return period;
  return lang === 'ko' ? `${match[1]}년 ${match[2]}분기` : `${match[1]} Q${match[2]}`;
}

function metricOf(anomalies: ApiRecord[], metric: string): ApiRecord | undefined {
  return anomalies.find(item => item.metric === metric);
}

function metricDelta(anomalies: ApiRecord[], metric: string, fallback: number): number {
  return num(metricOf(anomalies, metric)?.delta_pct, fallback);
}

function sourceName(id: string): { ko: string; en: string } {
  const names: Record<string, { ko: string; en: string }> = {
    revenue_brief_view: { ko: '매출 브리프 Gold', en: 'Revenue Brief Gold' },
    revenue_anomaly_results: { ko: '매출 이상 신호 Gold', en: 'Revenue Anomaly Gold' },
    cause_evidence_candidates: { ko: '원인 근거 후보 Gold', en: 'Cause Evidence Gold' },
    action_recommendation_candidates: { ko: '액션 추천 후보 Gold', en: 'Action Recommendation Gold' },
    revenue_context_mart: { ko: '매출 컨텍스트 Mart', en: 'Revenue Context Mart' },
    kakao_geocoding: { ko: '위치 확인', en: 'Location' },
    kma_weather: { ko: '날씨 맥락', en: 'Weather' },
    seoul_commercial_benchmark: { ko: '서울 상권 benchmark', en: 'Seoul benchmark' },
    seoul_foot_traffic_proxy: { ko: '서울 유동인구', en: 'Seoul foot traffic' },
    seoul_store_density_proxy: { ko: '서울 점포 밀도', en: 'Seoul store density' },
    naver_local_competitor_search: { ko: '네이버 주변 점포', en: 'Naver nearby stores' },
    naver_search_trend: { ko: '네이버 검색 관심도', en: 'Naver search trend' },
    korean_holiday_calendar: { ko: '공휴일·특일', en: 'Holiday calendar' },
    toss_place_connector_smoke: { ko: 'Toss Place', en: 'Toss Place' },
    delivery_provider_connector_smoke: { ko: '배달앱 Provider', en: 'Delivery provider' },
    delivery_upload_parser: { ko: '배달 업로드 파서', en: 'Delivery upload parser' },
  };
  return names[id] ?? { ko: id, en: id };
}

function inferCause(candidate: ApiRecord, index: number, fallback: CauseCandidate): CauseCandidate {
  const rawType = `${candidate.evidence_type ?? candidate.cause_type ?? candidate.metric_name ?? candidate.summary ?? ''}`.toLowerCase();
  const rawText = `${candidate.summary ?? candidate.title ?? candidate.description ?? ''}`;
  const id = rawType.includes('weather') || rawText.includes('강수') || rawText.includes('비')
    ? 'weather'
    : rawType.includes('compet') || rawText.includes('점포') || rawText.includes('경쟁')
      ? 'competition'
      : rawType.includes('population') || rawType.includes('demand') || rawText.includes('생활인구')
        ? 'demand'
        : `context-${index + 1}`;

  const title = id === 'weather'
    ? { ko: '강수일수 증가', en: 'More rainy days' }
    : id === 'competition'
      ? { ko: '동종 점포수 증가', en: 'More nearby competitors' }
      : id === 'demand'
        ? { ko: '생활인구·수요 약화', en: 'Foot traffic / demand softened' }
        : { ko: '컨텍스트 변화', en: 'Context shift' };

  const strengthValue = str(candidate.evidence_strength, str(candidate.strength, fallback.strength));
  const strength: SignalStrength =
    strengthValue === 'strong' || strengthValue === 'medium' || strengthValue === 'weak'
      ? strengthValue
      : fallback.strength;
  const headline = rawText || fallback.headline.ko;

  return {
    ...fallback,
    id,
    icon: id.startsWith('context') ? 'context' : id,
    strength,
    title,
    headline: { ko: headline, en: headline },
    body: {
      ko: rawText || fallback.body.ko,
      en: rawText || fallback.body.en,
    },
    delta: num(candidate.delta_pct, fallback.delta),
    sources: [str(candidate.source_ref, 'gold_export')],
  };
}

function buildCauses(brief: ApiRecord | undefined, anomalies: ApiRecord[]): CauseCandidate[] {
  const candidates = asRecordList(brief?.top_cause_candidates);
  const source = candidates.length > 0 ? candidates : anomalies.slice(0, 4);
  if (source.length === 0) return SCENARIO.causes;

  const seen = new Set<string>();
  const deduped: CauseCandidate[] = [];

  source.forEach((item, index) => {
    const cause = inferCause(item, index, SCENARIO.causes[index] ?? SCENARIO.causes[0]);
    const key = cause.id.startsWith('context')
      ? `${cause.title.ko}:${cause.headline.ko}`
      : cause.id;

    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(cause);
  });

  return deduped.length > 0 ? deduped.slice(0, 4) : SCENARIO.causes;
}

function buildActions(actions: ApiRecord[], causes: CauseCandidate[]): RcAction[] {
  if (actions.length === 0) return SCENARIO.actions;

  return actions.map((action, index) => {
    const description = str(action.description, str(action.why_this_action, SCENARIO.actions[index % SCENARIO.actions.length].summary.ko));
    const expected = str(action.expected_effect, '');
    const risk = str(action.risk_note, '');
    const fallback = SCENARIO.actions[index % SCENARIO.actions.length];
    return {
      id: str(action.action_id, fallback.id),
      effort: index % 3 === 0 ? 'low' : index % 3 === 1 ? 'medium' : 'high',
      impact: index % 3 === 1 ? 'high' : 'medium',
      timeframe: index < 3 ? 'this-week' : index < 5 ? 'next-2-weeks' : 'next-month',
      type: str(action.action_type, fallback.type),
      title: {
        ko: str(action.title, fallback.title.ko),
        en: str(action.title, fallback.title.en),
      },
      summary: { ko: description, en: description },
      tied: causes.length ? [causes[index % causes.length].id] : fallback.tied,
      // Per-card guarantee disclaimers removed; the global footer carries the
      // single SaaS-wide disclaimer. Keep risk_note only when supplied.
      steps: [
        { ko: description, en: description },
        { ko: expected || '실행 후 관측 지표 변화를 확인하고 다음 단계로 검토합니다.', en: expected || 'Observe the metric and review the next step.' },
        ...(risk ? [{ ko: risk, en: risk }] : []),
      ],
    };
  });
}

function buildReliability(brief: ApiRecord | undefined, context: ApiRecord | undefined, pipelineMeta: Record<string, unknown> | undefined): Scenario['reliability'] {
  const goldFiles = isRecord(pipelineMeta?.gold_files) ? pipelineMeta.gold_files : {};
  const freshness = str(brief?.generated_at, SCENARIO.reliability.sources[0].freshness).slice(0, 10);
  const coverage = Math.round(num(context?.source_coverage_score, 1) * 100);
  const latestCollectorRun = isRecord(pipelineMeta?.latest_collector_run) ? pipelineMeta.latest_collector_run : undefined;
  const collectorMetadata = isRecord(latestCollectorRun?.metadata) ? latestCollectorRun.metadata : {};
  const collectorRows = asRecordList(collectorMetadata.collectors);
  if (collectorRows.length > 0) {
    const sources = collectorRows.map(collector => {
      const id = str(collector.name, str(collector.collector_name, 'collector'));
      const statusText = str(collector.status, 'partial');
      const status: 'ok' | 'partial' | 'failed' | 'skipped' =
        statusText === 'completed' ? 'ok' : statusText === 'failed' ? 'failed' : statusText === 'skipped' ? 'skipped' : 'partial';
      return {
        id,
        name: sourceName(id),
        sourceName: str(collector.source_name, ''),
        freshness: str(collector.freshness, str(collector.collected_at, freshness)).slice(0, 19).replace('T', ' '),
        cadence: { ko: '수집기', en: 'Collector' },
        status,
        coverage: status === 'ok' ? 100 : status === 'failed' ? 20 : 0,
        durationMs: num(collector.duration_ms, 0),
        reason: str(collector.reason, '') || null,
      };
    });
    const failureCount = num(pipelineMeta?.failed_collector_count, sources.filter(source => source.status === 'failed').length);
    return {
      overall: failureCount > 0 ? 'partial' : 'healthy',
      sources,
      runs: Math.max(SCENARIO.reliability.runs, sources.length),
      failures: failureCount,
      lastRun: {
        ko: str(latestCollectorRun?.completed_at, str(latestCollectorRun?.created_at, freshness)).slice(0, 19).replace('T', ' '),
        en: str(latestCollectorRun?.completed_at, str(latestCollectorRun?.created_at, freshness)).slice(0, 19).replace('T', ' '),
      },
    };
  }
  const sources = Object.keys(goldFiles).length
    ? Object.keys(goldFiles).map(id => ({
      id,
      name: sourceName(id),
      freshness,
      cadence: { ko: '배치', en: 'Batch' },
      status: str(goldFiles[id]) ? 'ok' as const : 'partial' as const,
      coverage: str(goldFiles[id]) ? coverage : 0,
    }))
    : SCENARIO.reliability.sources;

  return {
    overall: 'healthy',
    sources,
    runs: SCENARIO.reliability.runs,
    failures: 0,
    lastRun: { ko: freshness, en: freshness },
  };
}

function buildStatuses(actions: ApiRecord[]): ActionStatuses {
  const statuses: ActionStatuses = { ...DEFAULT_STATUSES };
  actions.forEach(action => {
    const id = str(action.action_id);
    const status = str(action.status) as ActionStatus;
    if (id && ['recommended', 'selected', 'planned', 'done', 'dismissed'].includes(status)) {
      statuses[id] = status;
    }
  });
  return statuses;
}

export function wantsApiData(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('data') === 'api') return true;
  const [, hashQuery = ''] = window.location.hash.split('?');
  return new URLSearchParams(hashQuery).get('data') === 'api';
}

export function buildScenarioFromApi(payload: RevenueApiPayload): { scenario: Scenario; defaultStatuses: ActionStatuses } {
  const briefs = asRecordList(payload.briefs);
  const anomalies = asRecordList(payload.anomalies);
  const actions = asRecordList(payload.actions);
  const contextRows = asRecordList(payload.context);
  const brief = briefs[0];
  const context = contextRows[0];
  const revenueAnomaly = metricOf(anomalies, 'revenue_amount');
  const causes = buildCauses(brief, anomalies);
  const revenueChange = metricDelta(anomalies, 'revenue_amount', SCENARIO.revenueChange);
  const latestRevenueUpload = isRecord(payload.pipelineMeta?.latest_revenue_upload)
    ? payload.pipelineMeta?.latest_revenue_upload
    : null;
  const hasRevenueData = Boolean(latestRevenueUpload);
  const storeName = str(brief?.store_name, str(payload.pipelineMeta?.store_name, ''));
  const isDemo = Boolean(isRecord(latestRevenueUpload?.metadata) && latestRevenueUpload.metadata.is_demo)
    || str(latestRevenueUpload?.source_type).includes('synthetic')
    || str(storeName).toLowerCase().includes('demo');

  const dailySeriesRaw = Array.isArray(brief?.daily_series) ? brief.daily_series : [];
  const uploadedDailySeries: Array<{ date: string; net_sales: number; order_count?: number }> = [];
  for (const row of dailySeriesRaw) {
    if (!isRecord(row)) continue;
    const date = str(row.date);
    const net = num(row.net_sales, NaN);
    if (!date || !Number.isFinite(net)) continue;
    const orders = num(row.order_count, NaN);
    uploadedDailySeries.push({
      date,
      net_sales: net,
      ...(Number.isFinite(orders) ? { order_count: orders } : {}),
    });
  }
  const periodLabelFromBrief = str(brief?.period_label);
  const insufficientFlag = brief?.insufficient_data === true;

  const scenario: Scenario = {
    ...SCENARIO,
    uploadedDailySeries: uploadedDailySeries.length ? uploadedDailySeries : undefined,
    insufficientData: insufficientFlag || undefined,
    periodLabel: periodLabelFromBrief || undefined,
    area: {
      ko: str(brief?.trade_area_name, str(context?.trade_area_name, SCENARIO.area.ko)),
      en: str(brief?.trade_area_name, SCENARIO.area.en),
    },
    category: {
      ko: str(brief?.service_category_name, str(context?.service_category_name, SCENARIO.category.ko)),
      en: str(brief?.service_category_name, SCENARIO.category.en),
    },
    base: {
      ko: fmtQuarter(str(revenueAnomaly?.baseline_period, '2024Q3'), 'ko'),
      en: fmtQuarter(str(revenueAnomaly?.baseline_period, '2024Q3'), 'en'),
    },
    compare: {
      ko: fmtQuarter(str(revenueAnomaly?.compare_period, str(brief?.period_label, '2024Q4')), 'ko'),
      en: fmtQuarter(str(revenueAnomaly?.compare_period, str(brief?.period_label, '2024Q4')), 'en'),
    },
    revenueChange,
    txnChange: metricDelta(anomalies, 'transaction_count', SCENARIO.txnChange),
    ticketChange: metricDelta(anomalies, 'avg_ticket_size', SCENARIO.ticketChange),
    populationChange: num(context?.population_change_pct, SCENARIO.populationChange),
    competitorChange: num(context?.store_count_change, SCENARIO.competitorChange),
    rainyDayChange: num(context?.rain_day_count, SCENARIO.rainyDayChange),
    revSeries: SCENARIO.revSeries.map((point, index, series) => (
      index === series.length - 1 ? { ...point, v: 100 + revenueChange } : point
    )),
    causes,
    actions: buildActions(actions, causes),
    reliability: buildReliability(brief, context, payload.pipelineMeta),
    hasRevenueData,
    isDemo,
    storeName,
  };

  return { scenario, defaultStatuses: buildStatuses(actions) };
}

export function getMockData(): { scenario: Scenario; defaultStatuses: ActionStatuses } {
  return { scenario: SCENARIO, defaultStatuses: DEFAULT_STATUSES };
}
