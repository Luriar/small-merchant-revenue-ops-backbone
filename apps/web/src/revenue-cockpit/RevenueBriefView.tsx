import { useState } from 'react';
import { SCENARIO, tr, fmtPct } from './revenueCockpitCopy';
import { Icon, Pill, StrengthDots, Sparkline, StatePill, StateMenu, stateTone } from './revenueCockpitShared';
import { RevenueTrendChart } from './RevenueTrendChart';
import { resolveTrend, trendCopy, buildUpsideScenario } from './revenueTrendScenarios';
import type { RcLang, RcScreen, ActionStatuses, ActionStatus, RcAction, CauseCandidate, Scenario } from './revenueCockpitTypes';

type TrendWindow = '8Q' | '4Q' | 'YoY' | 'daily' | 'weekly' | 'monthly';

interface UploadedDailyPoint {
  date: string;
  net_sales: number;
  order_count?: number;
}

// Demo trend toggle (Auto/Down/Up) is hidden in production-facing UI. It only
// surfaces when the bundle is built in dev AND the URL has demoControls=1.
function shouldShowDemoTrendToggle(): boolean {
  type DevImportMeta = ImportMeta & { env?: { DEV?: boolean } };
  const isDev = Boolean((import.meta as DevImportMeta).env?.DEV);
  if (!isDev) return false;
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('demoControls') === '1') return true;
  const [, hashQuery = ''] = window.location.hash.split('?');
  return new URLSearchParams(hashQuery).get('demoControls') === '1';
}

// ─── cause rail (compact row for right rail) ──────────────────────────────────

function CauseRail({ c, lang, trend, rank, onOpen }: { c: CauseCandidate; lang: RcLang; trend: 'up' | 'down' | 'flat'; rank: number; onOpen: () => void }) {
  const impactLabel = lang === 'ko'
    ? trend === 'up'
      ? '상승 후보'
      : trend === 'down'
        ? '하락 후보'
        : '관찰 후보'
    : trend === 'up'
      ? 'Uplift signal'
      : trend === 'down'
        ? 'Downside signal'
        : 'Observed signal';
  const impactColor = trend === 'up'
    ? 'var(--rc-good-strong)'
    : trend === 'down'
      ? 'var(--rc-bad-strong)'
      : 'var(--rc-fg-muted)';
  const deltaColor = trend === 'up'
    ? 'var(--rc-good-strong)'
    : trend === 'down'
      ? 'var(--rc-bad-strong)'
      : 'var(--rc-fg-muted)';
  return (
    <button onClick={onOpen} style={{
      all: 'unset', cursor: 'pointer',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
      padding: '11px 12px', alignItems: 'center', width: '100%', boxSizing: 'border-box',
      border: '1px solid var(--rc-rule)', borderRadius: 10, background: 'var(--rc-surface-1)',
      boxShadow: 'var(--rc-shadow-sm)',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: 'var(--rc-surface-2)', color: 'var(--rc-accent-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name={c.icon} size={15}/></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="rc-mono" style={{ fontSize: 10, color: 'var(--rc-fg-dim)' }}>0{rank}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rc-fg-strong)' }}>{c.title[lang]}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.headline[lang]}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span className="rc-mono" style={{ fontSize: 10.5, fontWeight: 600, color: impactColor }}>
          {impactLabel}
        </span>
        <span style={{ color: c.strength === 'strong' ? 'var(--rc-accent-strong)' : c.strength === 'medium' ? 'var(--rc-fg-muted)' : 'var(--rc-fg-dim)' }}>
          <StrengthDots level={c.strength}/>
        </span>
      </div>
    </button>
  );
}

// ─── weekly plan ──────────────────────────────────────────────────────────────

function PlanChip({ a, lang, state, setState }: { a: RcAction; lang: RcLang; state: ActionStatus; setState: (s: ActionStatus) => void }) {
  const tone = stateTone[state];
  return (
    <div className="rc-keep-words" style={{
      background: state === 'dismissed' ? 'transparent' : 'var(--rc-surface-1)',
      border: `1px solid ${state === 'dismissed' ? 'var(--rc-rule)' : tone.bd}`,
      borderLeft: `3px solid ${tone.fg}`,
      borderRadius: 8, padding: '9px 10px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
      opacity: state === 'dismissed' ? 0.55 : 1,
      boxShadow: state === 'dismissed' ? 'none' : 'var(--rc-shadow-sm)',
      minWidth: 0,
      overflow: 'visible',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
        <StatePill state={state} lang={lang} size="sm"/>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3, color: 'var(--rc-accent-strong)', opacity: 0.85 }}>
          {a.tied.map(t => <Icon key={t} name={t} size={11}/>)}
        </span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rc-fg-strong)', lineHeight: 1.3,
        textDecoration: state === 'done' ? 'line-through' : 'none' }}>
        {a.title[lang]}
      </div>
      <div style={{ fontSize: 11, color: 'var(--rc-fg-muted)', lineHeight: 1.45 }}>{a.summary[lang]}</div>
      <StateMenu state={state} setState={setState} lang={lang}/>
    </div>
  );
}

function WeeklyPlan({ lang, actions, statuses, onSetStatus }: { lang: RcLang; actions: RcAction[]; statuses: ActionStatuses; onSetStatus: (id: string, s: ActionStatus) => void }) {
  const today = new Date();
  const monday = new Date(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - mondayOffset);

  const weekdayKo = ['월', '화', '수', '목', '금'];
  const weekdayEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const days = dayKeys.map((k, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return {
      k,
      d: lang === 'ko' ? weekdayKo[i] : weekdayEn[i],
      date,
    };
  });

  const dayFor: Record<string, number> = { 'rain-coupon': 0, 'stamp-card': 2, 'delivery-push': 4, 'instagram': 1, 'winter-set': 3, 'staff-rebalance': 0 };
  const byDay = days.map((_, i) => actions.filter((a, index) => (dayFor[a.id] ?? index % days.length) === i));
  const todayIdx = days.findIndex((d) => d.date.toDateString() === today.toDateString());

  return (
    <div className="rc-card" style={{ overflow: 'visible', boxShadow: 'var(--rc-shadow-sm)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--rc-rule)' }}>
        {days.map((d, i) => (
          <div key={d.k} style={{
            padding: '10px 14px', borderLeft: i ? '1px solid var(--rc-rule)' : 'none',
            background: i === todayIdx ? 'var(--rc-surface-2)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTopLeftRadius: i === 0 ? 12 : 0,
            borderTopRightRadius: i === days.length - 1 ? 12 : 0,
          }}>
            <div>
              <div className="rc-mono" style={{ fontSize: 9.5, color: 'var(--rc-fg-dim)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                {lang === 'ko' ? `${d.date.getMonth() + 1}·${d.date.getDate()}` : d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="rc-serif" style={{ fontSize: 14, fontWeight: 600, color: i === todayIdx ? 'var(--rc-accent-strong)' : 'var(--rc-fg-strong)' }}>
                {d.d}{i === todayIdx && <span style={{ fontSize: 9.5, color: 'var(--rc-accent)', marginLeft: 6, letterSpacing: '0.06em' }}>{lang === 'ko' ? '오늘' : 'TODAY'}</span>}
              </div>
            </div>
            <span className="rc-mono" style={{ fontSize: 10, color: 'var(--rc-fg-dim)' }}>{byDay[i].length}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignItems: 'stretch' }}>
        {byDay.map((items, i) => (
          <div key={i} style={{
            padding: '10px 10px 16px', borderLeft: i ? '1px solid var(--rc-rule)' : 'none',
            background: 'var(--rc-surface-0)',
            display: 'flex', flexDirection: 'column', gap: 8,
            minHeight: '100%',
            borderBottomLeftRadius: i === 0 ? 12 : 0,
            borderBottomRightRadius: i === days.length - 1 ? 12 : 0,
          }}>
            {items.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px dashed var(--rc-rule)', borderRadius: 8, fontSize: 10.5,
                color: 'var(--rc-fg-dim)', minHeight: 80, padding: 8, textAlign: 'center' }}>
                {lang === 'ko' ? '비어있음' : 'Open'}
              </div>
            ) : items.map(a => (
              <PlanChip key={a.id} a={a} lang={lang}
                state={statuses[a.id] ?? 'recommended'}
                setState={st => onSetStatus(a.id, st)}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── shortlist row (right rail "this week" section) ───────────────────────────

function ShortlistRow({ a, lang, state, setState }: { a: RcAction; lang: RcLang; state: ActionStatus; setState: (s: ActionStatus) => void }) {
  return (
    <div style={{
      background: 'var(--rc-surface-1)', borderRadius: 10,
      border: '1px solid var(--rc-rule)', boxShadow: 'var(--rc-shadow-sm)',
      padding: '11px 12px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <StatePill state={state} lang={lang} size="sm"/>
          <span style={{ display: 'inline-flex', gap: 3, color: 'var(--rc-accent-strong)', opacity: 0.85 }}>
            {a.tied.map(t => <Icon key={t} name={t} size={11}/>)}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rc-fg-strong)',
          textDecoration: state === 'done' ? 'line-through' : 'none' }}>{a.title[lang]}</div>
        <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', marginTop: 2 }}>{a.summary[lang]}</div>
      </div>
      <StateMenu state={state} setState={setState} lang={lang} align="right"/>
    </div>
  );
}

// ─── reliability compact (right rail bottom) ──────────────────────────────────

function ReliabilityCompact({ lang, scenario, onOpen }: { lang: RcLang; scenario: Scenario; onOpen: () => void }) {
  const publicContextCollectorIds = new Set([
    'kakao_geocoding',
    'kma_weather',
    'seoul_commercial_benchmark',
    'seoul_foot_traffic_proxy',
    'seoul_store_density_proxy',
    'naver_local_competitor_search',
    'naver_search_trend',
    'korean_holiday_calendar',
  ]);
  const connectorFoundationCollectorIds = new Set([
    'toss_place_connector_smoke',
    'delivery_provider_connector_smoke',
  ]);
  const publicSources = scenario.reliability.sources.filter(source => publicContextCollectorIds.has(source.id));
  const publicScope = publicSources.length > 0
    ? publicSources
    : scenario.reliability.sources.filter(source => !connectorFoundationCollectorIds.has(source.id));
  const publicOk = publicScope.filter(source => source.status === 'ok').length;
  const connectorWaiting = scenario.reliability.sources
    .filter(source => connectorFoundationCollectorIds.has(source.id) && source.status === 'skipped')
    .length;
  const failures = Math.max(
    scenario.reliability.failures,
    scenario.reliability.sources.filter(source => source.status === 'failed').length,
  );
  const summary = lang === 'ko'
    ? `공개 맥락 ${publicOk}/${publicScope.length} 정상 · 외부 연동 ${connectorWaiting}개 대기 · 실패 ${failures}`
    : `Public context ${publicOk}/${publicScope.length} OK · ${connectorWaiting} waiting · ${failures} failures`;
  return (
    <button onClick={onOpen} className="rc-card" style={{
      all: 'unset', cursor: 'pointer', display: 'block', boxSizing: 'border-box',
      background: 'var(--rc-surface-1)', border: '1px solid var(--rc-rule)', borderRadius: 12,
      padding: '14px 16px', boxShadow: 'var(--rc-shadow-sm)', width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'var(--rc-good-soft)', color: 'var(--rc-good-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="check" size={13}/></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rc-fg-strong)' }}>
            {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)' }}>
            {summary}
          </div>
        </div>
        <Icon name="arrow-right" size={13}/>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {scenario.reliability.sources.map(src => (
          <div key={src.id} title={src.name[lang]} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: src.status === 'ok' ? 'var(--rc-good)' : 'var(--rc-accent)',
            opacity: 0.85,
          }}/>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--rc-fg-dim)', fontFamily: 'var(--rc-mono)' }}>
        {tr('freshAsOf', lang)} {scenario.reliability.lastRun[lang]} · {lang === 'ko' ? '상권/업종 단위 추정치' : 'Trade-area estimate'}
      </div>
    </button>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

interface RevenueBriefViewProps {
  lang: RcLang;
  scenario?: Scenario;
  onNavigate: (screen: RcScreen) => void;
  statuses: ActionStatuses;
  onSetStatus: (id: string, status: ActionStatus) => void;
}

export function RevenueBriefView({ lang, scenario = SCENARIO, onNavigate, statuses, onSetStatus }: RevenueBriefViewProps) {
  // Demo upside toggle: when running on the static SCENARIO and the user has
  // not loaded API data yet, allow flipping to the upside scenario so the
  // product surfaces a positive demo path. This is a pure client toggle.
  const [demoTrend, setDemoTrend] = useState<'auto' | 'up' | 'down'>('auto');
  const useUpsideDemo = demoTrend === 'up' && scenario === SCENARIO;
  const useDownsideDemo = demoTrend === 'down' && scenario === SCENARIO;
  const effectiveScenario = useUpsideDemo
    ? buildUpsideScenario(scenario)
    : useDownsideDemo
      ? scenario
      : scenario;

  const uploadedSeries = effectiveScenario.uploadedDailySeries;
  const uploadedPoints = Array.isArray(uploadedSeries) ? [...uploadedSeries].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const isUploadedMode = uploadedPoints.length >= 2;

  const seriesTransactionTotal = uploadedPoints.reduce((sum, point) => sum + Number(point.order_count || 0), 0);
  const seriesNetSalesTotal = uploadedPoints.reduce((sum, point) => sum + Number(point.net_sales || 0), 0);
  // Prefer the backend-resolved revenue_summary (which already enforces
  // AOV = total_sales / total_orders consistently with the chart). Fall back
  // to summing the uploaded daily series when the summary is unavailable.
  const summary = effectiveScenario.uploadedRevenueSummary;
  const uploadedTransactionTotal = summary?.orderCountTotal && summary.orderCountTotal > 0
    ? summary.orderCountTotal
    : seriesTransactionTotal;
  const uploadedNetSalesTotal = summary?.netSalesTotal && summary.netSalesTotal > 0
    ? summary.netSalesTotal
    : seriesNetSalesTotal;
  const uploadedTicketAverage = summary?.avgTicket && summary.avgTicket > 0
    ? summary.avgTicket
    : (uploadedTransactionTotal > 0 ? Math.round(uploadedNetSalesTotal / uploadedTransactionTotal) : 0);
  const uploadedTransactionLabel = uploadedTransactionTotal >= 1000
    ? (uploadedTransactionTotal / 1000).toFixed(1) + 'k'
    : uploadedTransactionTotal.toLocaleString();
  const uploadedTicketLabel = '₩' + uploadedTicketAverage.toLocaleString();

  const uploadedRecent = uploadedPoints.slice(-30);
  const uploadedPrevious = uploadedPoints.slice(-60, -30);
  const uploadedRecentOrders = uploadedRecent.reduce((sum, point) => sum + Number(point.order_count || 0), 0);
  const uploadedPreviousOrders = uploadedPrevious.reduce((sum, point) => sum + Number(point.order_count || 0), 0);
  const uploadedTransactionChange = uploadedPreviousOrders > 0
    ? ((uploadedRecentOrders - uploadedPreviousOrders) / uploadedPreviousOrders) * 100
    : 0;
  const uploadedRecentSales = uploadedRecent.reduce((sum, point) => sum + Number(point.net_sales || 0), 0);
  const uploadedPreviousSales = uploadedPrevious.reduce((sum, point) => sum + Number(point.net_sales || 0), 0);
  const uploadedRecentTicket = uploadedRecentOrders > 0 ? uploadedRecentSales / uploadedRecentOrders : 0;
  const uploadedPreviousTicket = uploadedPreviousOrders > 0 ? uploadedPreviousSales / uploadedPreviousOrders : 0;
  const uploadedTicketChange = uploadedPreviousTicket > 0
    ? ((uploadedRecentTicket - uploadedPreviousTicket) / uploadedPreviousTicket) * 100
    : 0;
  const [chartWindow, setChartWindow] = useState<TrendWindow>(isUploadedMode ? 'daily' : '8Q');
  // When the chart mode flips between projection and uploaded modes, re-pin
  // chartWindow to a value that exists in the active mode.
  const validForUploaded: TrendWindow[] = ['daily', 'weekly', 'monthly'];
  const validForProjection: TrendWindow[] = ['8Q', '4Q', 'YoY'];
  const allowedWindows = isUploadedMode ? validForUploaded : validForProjection;
  if (!allowedWindows.includes(chartWindow)) {
    // Avoid setState during render; defer:
    queueMicrotask(() => setChartWindow(allowedWindows[0]));
  }
  const uploadedRecentTrend = computeUploadedRecentTrend(effectiveScenario.uploadedDailySeries);
  const trend = uploadedRecentTrend?.trend ?? resolveTrend(effectiveScenario);
  const tcopy = trendCopy(lang)[trend];
  const presentationScenario = uploadedRecentTrend?.trend === 'up'
    ? {
        ...buildUpsideScenario(effectiveScenario),
        uploadedDailySeries: effectiveScenario.uploadedDailySeries,
        uploadedRevenueSummary: effectiveScenario.uploadedRevenueSummary,
        periodLabel: effectiveScenario.periodLabel,
        reliability: effectiveScenario.reliability,
      }
    : effectiveScenario;

  const causeSectionTitle = lang === 'ko'
    ? trend === 'up'
      ? '왜 올랐을지'
      : trend === 'down'
        ? '왜 줄었을지'
        : '왜 변화했을지'
    : trend === 'up'
      ? 'Why it rose'
      : trend === 'down'
        ? 'Why it fell'
        : 'Why it changed';
  const causeListSummary = lang === 'ko'
    ? trend === 'up'
      ? `상승 요인 ${presentationScenario.causes.length}개 후보 · 신호 강함 순`
      : trend === 'down'
        ? `하락 원인 ${presentationScenario.causes.length}개 후보 · 신호 강함 순`
        : `${presentationScenario.causes.length}개 후보 · 신호 강함 순`
    : trend === 'up'
      ? `${presentationScenario.causes.length} uplift candidates · sorted by signal strength`
      : trend === 'down'
        ? `${presentationScenario.causes.length} downside candidates · sorted by signal strength`
        : `${presentationScenario.causes.length} candidates · sorted by signal strength`;

  const thisWeekActions = presentationScenario.actions.filter(a => a.timeframe === 'this-week');
  const revenueDeltaUnavailable = Math.abs(effectiveScenario.revenueChange) < 0.05;
  const secondaryMetrics = [
    { lab: lang === 'ko' ? '거래건수'  : 'Transactions', v: isUploadedMode ? uploadedTransactionLabel : '11.9k',  d: isUploadedMode ? uploadedTransactionChange : effectiveScenario.txnChange,        spark: trend === 'up'
      ? [{v:96},{v:97},{v:98},{v:99},{v:100},{v:102},{v:104},{v:108}]
      : [{v:100},{v:101},{v:99},{v:102},{v:104},{v:103},{v:100},{v:90}] },
    { lab: lang === 'ko' ? '객단가'    : 'Avg. ticket',  v: isUploadedMode ? uploadedTicketLabel : '₩6,450', d: isUploadedMode ? uploadedTicketChange : effectiveScenario.ticketChange,     spark: trend === 'up'
      ? [{v:100},{v:100},{v:100},{v:101},{v:101},{v:102},{v:103},{v:104}]
      : [{v:100},{v:99},{v:101},{v:102},{v:101},{v:100},{v:100},{v:98}] },
    { lab: lang === 'ko' ? '생활인구'  : 'Foot traffic', v: '142k',   sourceHint: lang === 'ko' ? '서울 열린데이터 기준 · 공개 상권 맥락' : 'Seoul Open Data · public context', d: effectiveScenario.populationChange, spark: trend === 'up'
      ? [{v:96},{v:97},{v:98},{v:99},{v:99},{v:100},{v:100},{v:106}]
      : [{v:104},{v:103},{v:102},{v:101},{v:101},{v:100},{v:100},{v:91.6}] },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', minHeight: '100%' }}>
      {/* ── LEFT ── */}
      <section style={{ padding: '32px 36px 44px', borderRight: '1px solid var(--rc-rule)', background: 'var(--rc-surface-0)' }}>
        <div className="rc-no-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5,
          color: 'var(--rc-fg-muted)', letterSpacing: lang === 'ko' ? '0.02em' : '0.12em', textTransform: lang === 'ko' ? 'none' : 'uppercase',
          padding: '4px 9px', borderRadius: 999, border: '1px solid var(--rc-rule)',
          background: 'var(--rc-surface-1)', boxShadow: 'var(--rc-shadow-sm)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Icon name="dot" size={9}/>
          {tcopy.eyebrow}
        </div>

        {scenario === SCENARIO && shouldShowDemoTrendToggle() && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8,
            border: '1px solid var(--rc-rule)', borderRadius: 999, padding: 2, background: 'var(--rc-surface-0)',
          }}
            title="Dev only: demoControls=1"
          >
            {([
              ['auto', lang === 'ko' ? '자동' : 'Auto'],
              ['down', lang === 'ko' ? '하락' : 'Down'],
              ['up',   lang === 'ko' ? '상승' : 'Up'],
            ] as const).map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => setDemoTrend(key)}
                style={{
                  all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  color: demoTrend === key ? 'var(--rc-fg-strong)' : 'var(--rc-fg-muted)',
                  background: demoTrend === key ? 'var(--rc-surface-2)' : 'transparent',
                }}>{label}</button>
            ))}
          </div>
        )}

        <h1 className="rc-serif rc-prose" style={{
          fontSize: 40, lineHeight: 1.18, letterSpacing: 0,
          margin: '16px 0 13px', color: 'var(--rc-fg-strong)', fontWeight: 400,
          maxWidth: 760,
        }}>
          {buildRevenueHeadline(lang, effectiveScenario, revenueDeltaUnavailable, trend)}
        </h1>

        <p className="rc-prose" style={{ fontSize: 14.5, color: 'var(--rc-fg-muted)', maxWidth: 640, margin: '0 0 18px', lineHeight: 1.7 }}>
          {buildBriefSubcopy(lang, presentationScenario, trend)}
        </p>

        {/* chart card */}
        <div className="rc-card" style={{ padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                {isUploadedMode
                  ? (lang === 'ko'
                      ? `업로드된 매출 · ${effectiveScenario.periodLabel ?? ''}`
                      : `Uploaded revenue · ${effectiveScenario.periodLabel ?? ''}`)
                  : (lang === 'ko' ? '추정매출 지수 · 2024 Q3 = 100' : 'Estimated revenue index · 2024 Q3 = 100')}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {isUploadedMode ? (
                  <span className="rc-serif rc-num" style={{ fontSize: 28, lineHeight: 1, color: 'var(--rc-fg-strong)', fontWeight: 500 }}>
                    {formatKRWHero(uploadedNetSalesTotal || uploadedSeriesTotal(uploadedSeries))}
                  </span>
                ) : (
                  <span className="rc-serif rc-num" style={{ fontSize: 28, lineHeight: 1, color: 'var(--rc-fg-strong)', fontWeight: 500 }}>
                    ₩ 1,224<span style={{ fontSize: 16, color: 'var(--rc-fg-muted)' }}>M</span>
                  </span>
                )}
                <span className="rc-num" style={{ fontSize: 13, fontWeight: 600,
                  color: trend === 'up' ? 'var(--rc-good-strong)' : trend === 'down' ? 'var(--rc-bad-strong)' : 'var(--rc-fg-muted)',
                  display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={trend === 'up' ? 'arrow-up' : trend === 'down' ? 'arrow-down' : 'dot'} size={12}/>
                  {isUploadedMode
                    ? chartWindowLabel(chartWindow, lang)
                    : `${fmtPct(effectiveScenario.revenueChange)} ${chartWindowLabel(chartWindow, lang)}`}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(allowedWindows).map(b => (
                <button key={b} type="button" onClick={() => setChartWindow(b)} style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  color: chartWindow === b ? 'var(--rc-fg-strong)' : 'var(--rc-fg-muted)',
                  background: chartWindow === b ? 'var(--rc-surface-2)' : 'transparent',
                  border: chartWindow === b ? '1px solid var(--rc-rule-strong)' : '1px solid transparent',
                  boxSizing: 'border-box',
                }}>{windowLabel(b, lang)}</button>
              ))}
            </div>
          </div>
          <RevenueTrendChart
            lang={lang}
            scenario={effectiveScenario}
            window={chartWindow}
            height={208}
            uploadedSeries={isUploadedMode ? uploadedSeries : undefined}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 8,
            borderTop: '1px dashed var(--rc-rule)', fontSize: 11.5, color: 'var(--rc-fg-muted)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--rc-accent-strong)', display: 'inline-flex', marginTop: 3 }}>
              <Icon name="shield" size={12}/>
            </span>
            <span className="rc-prose">
              {lang === 'ko'
                ? '함께 관측된 신호이며, 인과관계가 확정된 것은 아닙니다. 추가 확인이 필요합니다.'
                : 'Signals observed together — causality is not confirmed. Needs further confirmation.'}
            </span>
          </div>
        </div>

        {/* secondary metrics */}
        <div className="rc-card" style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 14,
          overflow: 'hidden', boxShadow: 'var(--rc-shadow-sm)',
        }}>
          {secondaryMetrics.map((m, i) => (
            <div key={i} style={{ padding: '13px 16px', borderLeft: i ? '1px solid var(--rc-rule)' : 'none' }}>
              <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{m.lab}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                <span className="rc-num rc-serif" style={{ fontSize: 19, color: 'var(--rc-fg-strong)' }}>{m.v}</span>
                <span className="rc-num" style={{ fontSize: 11.5, fontWeight: 600,
                  color: m.d < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-good-strong)' }}>{fmtPct(m.d)}</span>
              </div>
              <div style={{ color: m.d < 0 ? 'var(--rc-bad)' : 'var(--rc-good)', marginTop: 2 }}>
                <Sparkline points={m.spark} width={180} height={24} fade="rgba(0,0,0,0.04)"/>
              </div>
            </div>
          ))}
        </div>

        {/* weekly plan */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
            <h2 className="rc-serif rc-prose" style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
              {lang === 'ko' ? '이번 주 실행 계획' : "This week's execution plan"}
            </h2>
            <button onClick={() => onNavigate('actions')} style={{
              all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--rc-accent-strong)',
              display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
            }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
          </div>
          <p className="rc-prose" style={{ fontSize: 12, color: 'var(--rc-fg-muted)', margin: '0 0 9px' }}>
            {tcopy.actionsLead}
          </p>
          <WeeklyPlan lang={lang} actions={thisWeekActions} statuses={statuses} onSetStatus={onSetStatus}/>
        </div>
      </section>

      {/* ── RIGHT RAIL ── */}
      <aside style={{ padding: '32px 28px 44px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* causes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 className="rc-serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
              {tr('whyMaybe', lang)}
            </h2>
            <button onClick={() => onNavigate('evidence')} style={{
              all: 'unset', cursor: 'pointer', fontSize: 11.5, color: 'var(--rc-accent-strong)',
              display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500,
            }}>{tr('seeEvidence', lang)} <Icon name="arrow-right" size={11}/></button>
          </div>
          <p className="rc-prose" style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', margin: '0 0 10px' }}>
            {causeListSummary}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {presentationScenario.causes.map((c, i) => (
              <CauseRail key={c.id} c={c} lang={lang} trend={trend} rank={i + 1} onOpen={() => onNavigate('evidence')}/>
            ))}
          </div>
        </div>

        {/* this week shortlist — softened active orange */}
        <div style={{
          border: '1px solid var(--rc-rule)',
          background: 'var(--rc-surface-1)',
          borderLeft: '3px solid var(--rc-accent)',
          borderRadius: 10, padding: '16px 18px', boxShadow: 'var(--rc-shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 className="rc-serif" style={{ fontSize: 17, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
              {tr('thisWeek', lang)}
            </h2>
            <Pill tone="quiet" size="sm">{Math.min(thisWeekActions.length, 3)} / {presentationScenario.actions.length}</Pill>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {presentationScenario.actions.filter(a => a.timeframe === 'this-week').slice(0, 3).map(a => (
              <ShortlistRow key={a.id} a={a} lang={lang}
                state={statuses[a.id] ?? 'recommended'}
                setState={st => onSetStatus(a.id, st)}/>
            ))}
          </div>
        </div>

        <ReliabilityCompact lang={lang} scenario={effectiveScenario} onOpen={() => onNavigate('reliability')}/>
      </aside>
    </div>
  );
}

function chartWindowLabel(window: TrendWindow, lang: 'ko' | 'en'): string {
  if (window === 'YoY')     return lang === 'ko' ? '전년 동분기 대비' : 'YoY vs same Q';
  if (window === '4Q')      return lang === 'ko' ? '직전 4분기 대비' : 'vs prior 4Q';
  if (window === 'daily')   return lang === 'ko' ? '업로드 일별 (평균 대비)' : 'Uploaded daily (vs avg)';
  if (window === 'weekly')  return lang === 'ko' ? '업로드 주별 합계' : 'Uploaded weekly total';
  if (window === 'monthly') return lang === 'ko' ? '업로드 월별 합계' : 'Uploaded monthly total';
  return lang === 'ko' ? '직전 분기 대비' : 'vs prior quarter';
}

function windowLabel(window: TrendWindow, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    if (window === '8Q') return '8분기';
    if (window === '4Q') return '4분기';
    if (window === 'YoY') return '전년';
    if (window === 'daily') return '일별';
    if (window === 'weekly') return '주별';
    if (window === 'monthly') return '월별';
  } else {
    if (window === 'daily') return 'Daily';
    if (window === 'weekly') return 'Weekly';
    if (window === 'monthly') return 'Monthly';
  }
  return window;
}

function uploadedSeriesTotal(series: UploadedDailyPoint[] | undefined): number {
  if (!series) return 0;
  return series.reduce((sum, point) => sum + (Number.isFinite(point.net_sales) ? point.net_sales : 0), 0);
}

function computeUploadedRecentTrend(series: UploadedDailyPoint[] | undefined): { trend: 'up' | 'down' | 'flat'; deltaPct: number } | null {
  if (!series || series.length < 60) return null;

  const byDate = new Map<string, number>();
  for (const point of series) {
    if (!point.date) continue;
    const sales = Number(point.net_sales);
    if (!Number.isFinite(sales)) continue;
    byDate.set(point.date, (byDate.get(point.date) ?? 0) + sales);
  }

  const daily = Array.from(byDate.entries())
    .map(([date, sales]) => ({ date, sales }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (daily.length < 60) return null;

  const recent = daily.slice(-30);
  const previous = daily.slice(-60, -30);

  const recentTotal = recent.reduce((sum, row) => sum + row.sales, 0);
  const previousTotal = previous.reduce((sum, row) => sum + row.sales, 0);

  if (previousTotal <= 0) return null;

  const deltaPct = ((recentTotal - previousTotal) / previousTotal) * 100;
  const trend = deltaPct > 1 ? 'up' : deltaPct < -1 ? 'down' : 'flat';

  return { trend, deltaPct };
}

function formatKRWHero(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100_000_000) return `₩${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 1_000_000)   return `₩${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000)       return `₩${Math.round(value / 1000)}K`;
  return `₩${Math.round(value)}`;
}

function buildBriefSubcopy(lang: 'ko' | 'en', scenario: Scenario, trend: 'up' | 'down' | 'flat'): string {
  if (lang === 'ko') {
    if (trend === 'up') {
      return `거래건수 증가와 함께 관측되었습니다. 같은 기간 생활인구가 늘고 강수일수는 줄었으며, 특정 메뉴군의 객단가가 함께 상승했습니다. 가능성 높은 상승 요인 후보 ${scenario.causes.length}건과 유지·확대 액션을 아래에서 확인해 주세요.`;
    }
    if (trend === 'down') {
      return `거래건수 감소와 함께 관측되었습니다. 같은 기간 생활인구가 줄고 강수일수와 인근 점포수가 늘었습니다. 가능성 높은 원인 후보 ${scenario.causes.length}건과 이번 주 액션을 아래에서 확인해주세요.`;
    }
    return `매출에 큰 변화가 없습니다. 거래건수와 객단가도 안정적으로 관측되었습니다. 관찰을 유지하면서 작은 실험으로 신호를 확인해 보세요. 후보 ${scenario.causes.length}건이 있습니다.`;
  }
  if (trend === 'up') {
    return `Transaction count rose alongside revenue. Foot traffic grew, rainy days fell, and ticket size on certain sets lifted. ${scenario.causes.length} likely uplift candidates and maintain/amplify actions are below.`;
  }
  if (trend === 'down') {
    return `Transaction count fell alongside revenue. Foot traffic softened, rainy days rose, and nearby café count grew. ${scenario.causes.length} likely cause candidates and this week's actions are below.`;
  }
  return `Revenue stayed roughly flat. Transactions and ticket size both held steady. Keep monitoring and run small experiments to surface signals. ${scenario.causes.length} candidates available.`;
}

function buildRevenueHeadline(lang: RcLang, scenario: Scenario, unavailable: boolean, trend: 'up' | 'down' | 'flat') {
  if (unavailable) {
    return lang === 'ko'
      ? <>등록된 매출 데이터를 기준으로 초기 브리프를 생성했습니다.</>
      : <>An initial brief was generated from the registered revenue data.</>;
  }
  // Calm single-line headline, with a single emphasized percentage span — no
  // small-caps lead, no fragmenting. Korean keep-all wrapping prevents
  // mid-word breaks at common widths.
  const uploadedTrend = computeUploadedRecentTrend(scenario.uploadedDailySeries);
  const effectiveTrend = uploadedTrend?.trend ?? trend;
  const delta = Math.abs(uploadedTrend?.deltaPct ?? scenario.revenueChange).toFixed(1);
  const semanticColor = effectiveTrend === 'up'
    ? 'var(--rc-good-strong)'
    : effectiveTrend === 'down'
      ? 'var(--rc-bad-strong)'
      : 'var(--rc-fg-strong)';
  const isUploadedHeadline = Array.isArray(scenario.uploadedDailySeries) && scenario.uploadedDailySeries.length >= 2;
  const pct = <span style={{ color: semanticColor, fontWeight: 700 }}>{delta}%</span>;
  if (lang === 'ko') {
    if (effectiveTrend === 'up') return isUploadedHeadline ? <>최근 30일 등록 매출이 직전 30일 대비 {pct} 늘었습니다.</> : <>{scenario.compare.ko} 추정매출이 직전 분기 대비 {pct} 늘었습니다.</>;
    if (effectiveTrend === 'down') return isUploadedHeadline ? <>최근 30일 등록 매출이 직전 30일 대비 {pct} 줄었습니다.</> : <>{scenario.compare.ko} 추정매출이 직전 분기 대비 {pct} 줄었습니다.</>;
    return isUploadedHeadline ? <>최근 30일 등록 매출에 큰 변화가 없습니다.</> : <>{scenario.compare.ko} 추정매출에 큰 변화가 없습니다.</>;
  }
  if (effectiveTrend === 'up') return isUploadedHeadline ? <>Registered revenue rose {pct} in the latest 30 days versus the previous 30 days.</> : <>Estimated revenue rose {pct} from the prior quarter.</>;
  if (effectiveTrend === 'down') return isUploadedHeadline ? <>Registered revenue fell {pct} in the latest 30 days versus the previous 30 days.</> : <>Estimated revenue fell {pct} from the prior quarter.</>;
  return isUploadedHeadline ? <>Registered revenue stayed roughly flat in the latest 30 days versus the previous 30 days.</> : <>Estimated revenue stayed roughly flat.</>;
}
