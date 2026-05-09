import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill } from './revenueCockpitShared';
import {
  buildCalendarContext,
  buildLocalEventContext,
  calendarCollectorCard,
  localEventCollectorCard,
  statusLabel as collectorStatusLabel,
  statusTone as collectorStatusTone,
} from './revenueContextCollectors';
import type { RcLang, Scenario, UploadedDailyRevenuePoint, ContextCollectorCard } from './revenueCockpitTypes';

interface DataReliabilityViewProps { lang: RcLang; scenario?: Scenario }

type AnalysisReadiness = 'sufficient' | 'limited' | 'insufficient';

interface SalesCoverageStats {
  daysCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  missingDates: number;
  totalSales: number;
  totalOrders: number;
}

function summarizeSalesCoverage(scenario: Scenario): SalesCoverageStats {
  const series: UploadedDailyRevenuePoint[] = Array.isArray(scenario.uploadedDailySeries) ? scenario.uploadedDailySeries : [];
  if (series.length === 0) {
    return { daysCount: 0, earliestDate: null, latestDate: null, missingDates: 0, totalSales: 0, totalOrders: 0 };
  }
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const earliest = sorted[0].date;
  const latest = sorted[sorted.length - 1].date;
  const earliestUtc = Date.UTC(
    Number(earliest.slice(0, 4)),
    Number(earliest.slice(5, 7)) - 1,
    Number(earliest.slice(8, 10)),
  );
  const latestUtc = Date.UTC(
    Number(latest.slice(0, 4)),
    Number(latest.slice(5, 7)) - 1,
    Number(latest.slice(8, 10)),
  );
  const spanDays = Math.round((latestUtc - earliestUtc) / 86400000) + 1;
  const presentDates = new Set(sorted.map((p) => p.date));
  const missingDates = Math.max(0, spanDays - presentDates.size);

  const summary = scenario.uploadedRevenueSummary;
  const totalSales = summary?.netSalesTotal && summary.netSalesTotal > 0
    ? summary.netSalesTotal
    : sorted.reduce((sum, point) => sum + Number(point.net_sales || 0), 0);
  const totalOrders = summary?.orderCountTotal && summary.orderCountTotal > 0
    ? summary.orderCountTotal
    : sorted.reduce((sum, point) => sum + Number(point.order_count || 0), 0);

  return {
    daysCount: presentDates.size,
    earliestDate: earliest,
    latestDate: latest,
    missingDates,
    totalSales,
    totalOrders,
  };
}

function resolveAnalysisReadiness(
  coverage: SalesCoverageStats,
  rel: Scenario['reliability'],
  contextCards: ContextCollectorCard[],
): AnalysisReadiness {
  const publicScope = rel.sources.filter((s) => !CONNECTOR_FOUNDATION_COLLECTOR_IDS.has(s.id));
  // Healthy context = at least one external collector reporting "ok" OR
  // the deterministic calendar collector (always healthy when sales data
  // exists). not_connected/planned cards do NOT count toward readiness.
  const anyExternalHealthy = publicScope.some((s) => s.status === 'ok');
  const calendarHealthy = contextCards.some((c) => c.id === 'calendar_context' && c.status === 'ok');
  const hasHealthyContext = anyExternalHealthy || calendarHealthy;
  if (coverage.daysCount >= 60 && hasHealthyContext) return 'sufficient';
  if (coverage.daysCount >= 30) return 'limited';
  return 'insufficient';
}

function formatKRWApprox(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100_000_000) return `₩${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 1_000_000) return `₩${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₩${Math.round(value / 1000)}K`;
  return `₩${Math.round(value)}`;
}

const PUBLIC_CONTEXT_COLLECTOR_IDS = new Set([
  'kakao_geocoding',
  'kma_weather',
  'seoul_commercial_benchmark',
  'seoul_foot_traffic_proxy',
  'seoul_store_density_proxy',
  'naver_local_competitor_search',
  'naver_search_trend',
  'korean_holiday_calendar',
]);

const CONNECTOR_FOUNDATION_COLLECTOR_IDS = new Set([
  'toss_place_connector_smoke',
  'delivery_provider_connector_smoke',
]);

function summarizeReliability(rel: Scenario['reliability']) {
  const publicSources = rel.sources.filter(source => PUBLIC_CONTEXT_COLLECTOR_IDS.has(source.id));
  const connectorSources = rel.sources.filter(source => CONNECTOR_FOUNDATION_COLLECTOR_IDS.has(source.id));
  const publicScope = publicSources.length > 0
    ? publicSources
    : rel.sources.filter(source => !CONNECTOR_FOUNDATION_COLLECTOR_IDS.has(source.id));

  const publicOk = publicScope.filter(source => source.status === 'ok').length;
  const publicTotal = publicScope.length;
  const connectorWaiting = connectorSources.filter(source => source.status === 'skipped').length;
  const actualFailures = Math.max(rel.failures, rel.sources.filter(source => source.status === 'failed').length);

  return { publicOk, publicTotal, connectorWaiting, actualFailures };
}

export function DataReliabilityView({ lang, scenario = SCENARIO }: DataReliabilityViewProps) {
  const rel = scenario.reliability;
  const summary = summarizeReliability(rel);
  const coverage = summarizeSalesCoverage(scenario);
  const calendarContext = buildCalendarContext(scenario.uploadedDailySeries);
  const localEventContext = buildLocalEventContext(scenario);
  const derivedCollectorCards: ContextCollectorCard[] = [
    calendarCollectorCard(calendarContext, lang),
    localEventCollectorCard(localEventContext, lang),
  ];
  const readiness = resolveAnalysisReadiness(coverage, rel, derivedCollectorCards);
  const readinessTone = readiness === 'sufficient' ? 'good' : readiness === 'limited' ? 'warm' : 'bad';
  const readinessLabel = readiness === 'sufficient'
    ? (lang === 'ko' ? '충분' : 'Sufficient')
    : readiness === 'limited'
      ? (lang === 'ko' ? '제한적' : 'Limited')
      : (lang === 'ko' ? '부족' : 'Insufficient');
  const readinessNote = readiness === 'sufficient'
    ? (lang === 'ko' ? '최근 매출 데이터와 외부 맥락이 있어 기본 분석이 가능합니다.' : 'Recent sales data and context sources are available for a basic analysis.')
    : readiness === 'limited'
      ? (lang === 'ko' ? '매출 데이터는 있지만 일부 외부 맥락이 부족해 해석이 제한적입니다.' : 'Sales data exists, but some external context is missing, so interpretation is limited.')
      : (lang === 'ko' ? '매출 데이터가 부족해 안정적인 비교가 어렵습니다.' : 'There is not enough sales data for stable comparison.');
  const partial = summary.actualFailures > 0 || summary.publicOk < summary.publicTotal;
  const connectorWaitingCopy = summary.connectorWaiting === 0
    ? (lang === 'ko' ? '외부 연동 대기 없음' : 'No connectors waiting')
    : (lang === 'ko' ? `외부 연동 ${summary.connectorWaiting}개 미연동` : `${summary.connectorWaiting} connectors not connected`);
  const latestRunCopy = lang === 'ko'
    ? `공개 맥락 ${summary.publicOk}/${summary.publicTotal} 수집됨 · ${connectorWaitingCopy} · 확인 필요 ${summary.actualFailures}건`
    : `Public context ${summary.publicOk}/${summary.publicTotal} collected · ${connectorWaitingCopy} · ${summary.actualFailures} need review`;

  type TrustCardTone = 'good' | 'warm' | 'neutral' | 'bad';
  const trustCards: Array<{ icon: string; tone: TrustCardTone; title: string; body: string }> = [
    {
      icon: partial ? 'shield' : 'check', tone: partial ? 'warm' : 'good',
      title: lang === 'ko'
        ? `공개 맥락 ${summary.publicOk}/${summary.publicTotal} 수집됨`
        : `Public context ${summary.publicOk}/${summary.publicTotal} collected`,
      body:  summary.publicOk === summary.publicTotal
        ? (lang === 'ko' ? '날씨 · 상권 · 유동인구 · 검색 · 공휴일 맥락이 모두 수집되었습니다.' : 'Weather, trade-area, foot-traffic, search, and holiday context are all collected.')
        : (lang === 'ko' ? '일부 공개 맥락은 참고 지표로 표시됩니다. 확인이 필요한 실패와는 분리해 표시합니다.' : 'Some public context is shown as a reference signal. It is separated from failures that need review.'),
    },
    {
      icon: 'spark2', tone: summary.connectorWaiting === 0 ? 'good' : 'neutral',
      title: summary.connectorWaiting === 0
        ? (lang === 'ko' ? '외부 연동 대기 없음' : 'No connectors waiting')
        : (lang === 'ko' ? `외부 연동 ${summary.connectorWaiting}개 미연동` : `${summary.connectorWaiting} connectors not connected`),
      body:  summary.connectorWaiting === 0
        ? (lang === 'ko' ? '연결된 외부 연동 자격 정보가 갱신을 기다리는 항목이 없습니다.' : 'No connector credentials are waiting for refresh.')
        : (lang === 'ko' ? 'Toss Place · 배달앱 연동은 자격 정보가 연결되면 자동으로 갱신됩니다.' : 'Toss Place and delivery provider connectors update automatically once credentials are configured.'),
    },
    {
      icon: summary.actualFailures > 0 ? 'shield' : 'check', tone: summary.actualFailures > 0 ? 'bad' : 'good',
      title: lang === 'ko' ? `확인 필요 ${summary.actualFailures}건` : `${summary.actualFailures} need review`,
      body:  summary.actualFailures > 0
        ? (lang === 'ko' ? '최근 수집에서 응답을 확인해야 하는 수집기가 있습니다.' : 'The latest collection has responses that need review.')
        : (lang === 'ko' ? '최근 live 수집에서 확인이 필요한 수집기는 없습니다.' : 'The latest live collection has no items needing review.'),
    },
  ];

  return (
    <div className="rc-reliability-page rc-page">
      {/* headline */}
      <div className="rc-reliability-hero">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5,
          color: 'var(--rc-fg-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <Icon name="shield" size={11}/> {lang === 'ko' ? '신뢰도' : 'Reliability'}
        </div>
        <h1 className="rc-serif" style={{ fontSize: 32, fontWeight: 400, margin: '10px 0 12px', color: 'var(--rc-fg-strong)', letterSpacing: 0 }}>
          {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
        </h1>
        <p className="rc-prose" style={{ fontSize: 14.5, color: 'var(--rc-fg-muted)', lineHeight: 1.7, margin: 0, maxWidth: 760 }}>
          {lang === 'ko'
            ? '이 브리프는 매장 매출 데이터와 공개·연동 맥락 수집 결과를 함께 보며 만듭니다. 일부 수집기가 지연되어도 초기 분석은 계속할 수 있습니다. 분석은 함께 관측된 신호를 정리한 것이지 인과관계를 확정한 것이 아닙니다.'
            : 'This brief combines store revenue data with public and connector context collection. Initial analysis can continue even when some collectors are delayed. Results summarize signals observed together, not proven causes.'}
        </p>
        <div className="rc-reliability-summary-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <Pill tone="good" size="sm">
            {lang === 'ko' ? '공개 맥락 ' + summary.publicOk + '/' + summary.publicTotal + ' 수집됨' : 'Public context ' + summary.publicOk + '/' + summary.publicTotal + ' collected'}
          </Pill>
          <Pill tone={summary.connectorWaiting > 0 ? 'quiet' : 'good'} size="sm">
            {summary.connectorWaiting === 0
              ? (lang === 'ko' ? '외부 연동 대기 없음' : 'No connectors waiting')
              : (lang === 'ko' ? `외부 연동 ${summary.connectorWaiting}개 미연동` : `${summary.connectorWaiting} connectors not connected`)}
          </Pill>
          <Pill tone={summary.actualFailures > 0 ? 'bad' : 'good'} size="sm">
            {lang === 'ko' ? '확인 필요 ' + summary.actualFailures + '건' : summary.actualFailures + ' need review'}
          </Pill>
        </div>

      </div>

      {/* sales data coverage + analysis readiness — answers "do we have
          enough sales data?" before showing context collector status. */}
      <div className="rc-card" style={{ marginTop: 18, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 className="rc-serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
            {lang === 'ko' ? '매출 데이터 범위' : 'Sales data coverage'}
          </h2>
          <Pill tone={readinessTone} size="sm">
            {(lang === 'ko' ? '분석 가능 수준 · ' : 'Analysis readiness · ') + readinessLabel}
          </Pill>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <CoverageStat
            label={lang === 'ko' ? '등록된 영업일' : 'Uploaded business days'}
            value={coverage.daysCount > 0 ? `${coverage.daysCount}${lang === 'ko' ? '일' : ' days'}` : '—'}
          />
          <CoverageStat
            label={lang === 'ko' ? '최근 매출일' : 'Latest sales date'}
            value={coverage.latestDate ?? '—'}
          />
          <CoverageStat
            label={lang === 'ko' ? '가장 빠른 매출일' : 'Earliest sales date'}
            value={coverage.earliestDate ?? '—'}
          />
          <CoverageStat
            label={lang === 'ko' ? '누락 가능 일자' : 'Potential missing dates'}
            value={coverage.daysCount > 0 ? `${coverage.missingDates}${lang === 'ko' ? '일' : ' days'}` : '—'}
          />
          <CoverageStat
            label={lang === 'ko' ? '총 거래건수' : 'Total orders'}
            value={coverage.totalOrders > 0 ? coverage.totalOrders.toLocaleString() : '—'}
          />
          <CoverageStat
            label={lang === 'ko' ? '총 매출' : 'Total sales'}
            value={coverage.totalSales > 0 ? formatKRWApprox(coverage.totalSales) : '—'}
          />
        </div>
        <p className="rc-prose" style={{ fontSize: 12.5, color: 'var(--rc-fg-muted)', lineHeight: 1.6, margin: '14px 0 0' }}>
          {readinessNote}
        </p>
      </div>

      {/* three trust cards — clear semantic colors */}
      <div className="rc-reliability-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
        {trustCards.map((card, i) => {
          const palette = card.tone === 'good'
            ? { bg: 'var(--rc-good-soft)', fg: 'var(--rc-good-strong)', accent: 'var(--rc-good)' }
            : card.tone === 'bad'
              ? { bg: 'var(--rc-bad-soft)',  fg: 'var(--rc-bad-strong)',  accent: 'var(--rc-bad)' }
              : card.tone === 'neutral'
                ? { bg: 'var(--rc-info-soft)', fg: 'var(--rc-info)',       accent: 'var(--rc-info)' }
                : { bg: 'var(--rc-warn-soft)', fg: 'var(--rc-warn-strong)', accent: 'var(--rc-warn)' };
          return (
            <div key={i} className="rc-card rc-reliability-trust-card" style={{ padding: '18px 18px 17px', borderTop: `3px solid ${palette.accent}` }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: palette.bg, color: palette.fg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
              }}><Icon name={card.icon} size={15}/></div>
              <div className="rc-serif rc-prose" style={{ fontSize: 16, fontWeight: 500, color: 'var(--rc-fg-strong)', marginBottom: 4 }}>
                {card.title}
              </div>
              <div className="rc-prose" style={{ fontSize: 12.5, color: 'var(--rc-fg-muted)', lineHeight: 1.6 }}>{card.body}</div>
            </div>
          );
        })}
      </div>

      {/* derived V1.2 collector cards — calendar (deterministic) and
          local-event (honest not-connected when no source is wired). */}
      <div style={{ marginTop: 22 }}>
        <h2 className="rc-serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
          {lang === 'ko' ? '맥락 수집기' : 'Context collectors'}
        </h2>
        <p className="rc-prose" style={{ fontSize: 12, color: 'var(--rc-fg-muted)', margin: '4px 0 12px' }}>
          {lang === 'ko'
            ? '외부 수집·계산된 맥락 소스의 현재 상태입니다. 미연결 항목은 정직하게 표시합니다.'
            : 'Current status of external and computed context sources. Not-connected items are shown transparently.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {derivedCollectorCards.map((card) => (
            <CollectorCard key={card.id} card={card} lang={lang}/>
          ))}
        </div>
      </div>

      {/* source detail table */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h2 className="rc-serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
            {lang === 'ko' ? '데이터 소스 상세' : 'Source details'}
          </h2>
          <span style={{ fontSize: 11, color: 'var(--rc-fg-dim)' }}>
            {lang === 'ko' ? '· 공개 맥락과 외부 연동 상태' : '· public context and connector status'}
          </span>
        </div>

        <div className="rc-card" style={{ overflow: 'hidden', boxShadow: 'var(--rc-shadow-sm)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.95fr 0.7fr 0.7fr',
            padding: '11px 18px', fontSize: 10.5, color: 'var(--rc-fg-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'var(--rc-surface-2)',
          }}>
            <span>{lang === 'ko' ? '데이터 소스' : 'Source'}</span>
            <span>{lang === 'ko' ? '제공처' : 'Provider'}</span>
            <span>{tr('freshAsOf', lang)}</span>
            <span>{lang === 'ko' ? '소요' : 'Duration'}</span>
            <span style={{ textAlign: 'right' }}>{lang === 'ko' ? '상태' : 'Status'}</span>
          </div>
          {rel.sources.map(src => {
            const tone = statusTone(src.status, src.reason);
            const hint = statusHint(src, lang);
            return (
              <div key={src.id} style={{
                display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.95fr 0.7fr 0.7fr',
                padding: '13px 18px', alignItems: 'center', borderTop: '1px solid var(--rc-rule)', fontSize: 12.5,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--rc-fg-strong)', fontWeight: 500 }}>{src.name[lang]}</div>
                  {hint && (
                    <div className="rc-prose" style={{ color: 'var(--rc-fg-muted)', fontSize: 11, marginTop: 2 }}>{hint}</div>
                  )}
                </div>
                <span style={{ color: 'var(--rc-fg-muted)' }}>{src.sourceName || src.cadence[lang]}</span>
                <span className="rc-mono" style={{ color: 'var(--rc-fg-muted)', fontSize: 11.5 }}>{src.freshness}</span>
                <span className="rc-mono" style={{ color: 'var(--rc-fg-muted)', fontSize: 11.5 }}>{typeof src.durationMs === 'number' ? `${src.durationMs}ms` : '-'}</span>
                <span style={{ textAlign: 'right' }}>
                  <Pill tone={tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : tone === 'warm' ? 'warm' : 'quiet'} size="sm">
                    {formatSourceStatus(src.status, src.reason, lang)}
                  </Pill>
                </span>
              </div>
            );
          })}
        </div>
        <details style={{ marginTop: 10, fontSize: 12, color: 'var(--rc-fg-muted)' }}>
          <summary>{lang === 'ko' ? '수집기 세부 사유 보기' : 'Show collector details'}</summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {rel.sources.map(src => (
              <div key={`${src.id}-detail`} className="rc-mono">
                {src.id} · {src.status}{src.reason ? ` · ${src.reason}` : ''}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* run info */}
      <div className="rc-card" style={{ marginTop: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--rc-good-soft)', color: 'var(--rc-good-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="check" size={13}/></span>
        <div style={{ fontSize: 13, color: 'var(--rc-fg)' }}>
          <strong>{latestRunCopy}</strong>
          <span style={{ color: 'var(--rc-fg-muted)', marginLeft: 8 }}>
            {tr('freshAsOf', lang)} {rel.lastRun[lang]}
          </span>
        </div>
      </div>

      {/* limits */}
      <div style={{
        marginTop: 22, padding: '16px 20px', borderRadius: 12,
        background: 'var(--rc-surface-2)', border: '1px solid var(--rc-rule)',
      }}>
        <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 8 }}>
          {lang === 'ko' ? '한계점 — 꼭 알아두세요' : 'Limits — please keep in mind'}
        </div>
        <ul className="rc-serif" style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--rc-fg)' }}>
          <li>{lang === 'ko' ? '분석 단위는 상권/업종이며, 개별 매장 매출이 아닙니다.' : 'Analysis is at trade-area / category level, not per individual store.'}</li>
          <li>{lang === 'ko' ? '매출과 인구는 모두 공공데이터 기반 추정치입니다.' : 'Revenue and population are public-data estimates.'}</li>
          <li>{lang === 'ko' ? '원인 후보는 함께 관측된 신호이며, 인과관계가 확정된 것이 아닙니다. 추가 확인이 필요합니다.' : 'Cause candidates reflect signals observed together, not proven causes — needs further confirmation.'}</li>
        </ul>
      </div>
    </div>
  );
}

function CollectorCard({ card, lang }: { card: ContextCollectorCard; lang: RcLang }) {
  const tone = collectorStatusTone(card.status);
  const pillTone = tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'warm' ? 'warm' : 'quiet';
  return (
    <div className="rc-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--rc-fg-strong)' }}>
          {card.label[lang]}
        </div>
        <Pill tone={pillTone} size="sm">{collectorStatusLabel(card.status, lang)}</Pill>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)' }}>
        {card.source_name || (lang === 'ko' ? '소스 미지정' : 'Source unspecified')}
        {card.last_collected_at && (
          <span className="rc-mono" style={{ marginLeft: 8, color: 'var(--rc-fg-dim)' }}>
            {(lang === 'ko' ? '최근 수집 ' : 'Last ') + card.last_collected_at}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--rc-fg)', lineHeight: 1.5 }}>
        {card.explanation}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--rc-fg-dim)' }}>
        {(lang === 'ko' ? '기여 영역 · ' : 'Contributes to · ') + card.contributes_to[lang]}
      </div>
    </div>
  );
}

function CoverageStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: '1px solid var(--rc-rule)', background: 'var(--rc-surface-0)',
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div className="rc-serif rc-num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--rc-fg-strong)', marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// Map raw collector statuses to product-friendly copy. Internal status names
// stay unchanged in code (ok/partial/failed/skipped); only user-facing labels
// change. "부분"/"실패" no longer leak into the UI as bare words.
function formatSourceStatus(status: string, reason: string | null | undefined, lang: RcLang): string {
  if (status === 'ok')      return lang === 'ko' ? '수집됨' : 'Collected';
  if (status === 'failed')  return lang === 'ko' ? '확인 필요' : 'Action needed';
  if (status === 'skipped') {
    const reasonText = reason ?? '';
    if (reasonText.includes('no_weather_items')) {
      return lang === 'ko' ? '관측 없음' : 'No observation';
    }
    if (reasonText.includes('secret') || reasonText.includes('credential')) {
      return lang === 'ko' ? '미연동' : 'Not connected';
    }
    if (reasonText.includes('permission')) {
      return lang === 'ko' ? '권한 필요' : 'Permission needed';
    }
    return lang === 'ko' ? '갱신 대기' : 'Waiting';
  }
  // partial → product-friendly "참고 지표"
  return lang === 'ko' ? '참고 지표' : 'Reference signal';
}

function statusTone(status: string, reason: string | null | undefined): 'good' | 'warm' | 'neutral' | 'bad' {
  if (status === 'ok')     return 'good';
  if (status === 'failed') return 'bad';
  if (status === 'skipped') return 'neutral';
  // partial — amber/warm reference
  // include reason hint for completeness even though we don't change tone here
  void reason;
  return 'warm';
}

function statusHint(source: Scenario['reliability']['sources'][number], lang: RcLang): string {
  const { id, status, reason } = source;

  if (status === 'partial') {
    return lang === 'ko'
      ? '최근 공개 데이터 기준으로 보조 비교에 사용됩니다.'
      : 'Used as a supporting comparison from the latest public dataset.';
  }

  if (status === 'failed') {
    return lang === 'ko'
      ? '최근 수집에서 확인이 필요한 응답이 있었습니다.'
      : 'The latest collection had responses that need review.';
  }

  if (status === 'skipped') {
    if (id === 'naver_search_trend' && reason === 'no_result') {
      return lang === 'ko'
        ? '현재 검색어 기준으로 관심도 결과가 없습니다. 등록되지 않았거나 검색량이 낮은 매장명은 결과가 없을 수 있습니다.'
        : 'No search-interest result is available for the current keyword. Unregistered or low-volume store names may not return results.';
    }

    return lang === 'ko'
      ? '연동 자격이 연결되면 자동으로 갱신됩니다.'
      : 'Updates automatically once credentials are connected.';
  }

  return '';
}
