import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill } from './revenueCockpitShared';
import type { RcLang, Scenario } from './revenueCockpitTypes';

interface DataReliabilityViewProps { lang: RcLang; scenario?: Scenario }

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
  const partial = summary.actualFailures > 0 || summary.publicOk < summary.publicTotal;
  const latestRunCopy = lang === 'ko'
    ? `공개 맥락 ${summary.publicOk}/${summary.publicTotal} 정상 · 외부 연동 ${summary.connectorWaiting}개 대기 · 실패 ${summary.actualFailures}`
    : `Public context ${summary.publicOk}/${summary.publicTotal} OK · ${summary.connectorWaiting} connectors waiting · ${summary.actualFailures} failures`;

  const trustCards = [
    {
      icon: partial ? 'shield' : 'check', tone: partial ? 'warm' : 'good',
      title: lang === 'ko'
        ? `공개 맥락 데이터 ${summary.publicOk}/${summary.publicTotal} 정상`
        : `Public context ${summary.publicOk}/${summary.publicTotal} OK`,
      body:  summary.publicOk === summary.publicTotal
        ? (lang === 'ko' ? '날씨·상권·유동인구·검색·공휴일 맥락이 정상 수집되었습니다.' : 'Weather, trade-area, foot-traffic, search, and holiday context were collected.')
        : (lang === 'ko' ? '일부 공개 맥락 수집 결과가 비어 있습니다. 실패와는 구분해 표시합니다.' : 'Some public context is unavailable. This is shown separately from failures.'),
    },
    {
      icon: 'spark2', tone: 'warm',
      title: lang === 'ko'
        ? `외부 연동 ${summary.connectorWaiting}개 연동 대기`
        : `${summary.connectorWaiting} connectors waiting`,
      body:  lang === 'ko'
        ? 'Toss Place와 배달앱 연동은 자격 정보가 연결되기 전까지 대기 상태로 봅니다.'
        : 'Toss Place and delivery provider connectors wait until credentials are configured.',
    },
    {
      icon: summary.actualFailures > 0 ? 'shield' : 'check', tone: summary.actualFailures > 0 ? 'warm' : 'good',
      title: lang === 'ko' ? `최근 실행 실패 ${summary.actualFailures}건` : `${summary.actualFailures} recent failures`,
      body:  summary.actualFailures > 0
        ? (lang === 'ko' ? '실패한 수집기가 있어 세부 사유 확인이 필요합니다.' : 'One or more collectors failed and need review.')
        : (lang === 'ko' ? '최근 live 수집 실행에서 실패한 수집기는 없습니다.' : 'The latest live collection has no failed collectors.'),
    },
  ];

  return (
    <div className="rc-reliability-page" style={{ padding: '34px 40px 46px' }}>
      {/* headline */}
      <div className="rc-reliability-hero" style={{ maxWidth: 980 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5,
          color: 'var(--rc-fg-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <Icon name="shield" size={11}/> {lang === 'ko' ? '신뢰도' : 'Reliability'}
        </div>
        <h1 className="rc-serif" style={{ fontSize: 32, fontWeight: 400, margin: '10px 0 12px', color: 'var(--rc-fg-strong)', letterSpacing: 0 }}>
          {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--rc-fg-muted)', lineHeight: 1.65, margin: 0 }}>
          {lang === 'ko'
            ? '이 브리프는 매장 매출 데이터와 공개·연동 맥락 수집 결과를 함께 보며 만듭니다. 일부 수집기가 지연되어도 초기 분석은 계속할 수 있습니다. 분석은 함께 관측된 신호를 정리한 것이지 인과관계를 확정한 것이 아닙니다.'
            : 'This brief combines store revenue data with public and connector context collection. Initial analysis can continue even when some collectors are delayed. Results summarize signals observed together, not proven causes.'}
        </p>
        <div className="rc-reliability-summary-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <Pill tone="good" size="sm">
            {lang === 'ko' ? '공개 맥락 ' + summary.publicOk + '/' + summary.publicTotal + ' 정상' : 'Public context ' + summary.publicOk + '/' + summary.publicTotal + ' OK'}
          </Pill>
          <Pill tone={summary.connectorWaiting > 0 ? 'warm' : 'good'} size="sm">
            {lang === 'ko' ? '외부 연동 ' + summary.connectorWaiting + '개 대기' : summary.connectorWaiting + ' connectors waiting'}
          </Pill>
          <Pill tone={summary.actualFailures > 0 ? 'warm' : 'good'} size="sm">
            {lang === 'ko' ? '실패 ' + summary.actualFailures : summary.actualFailures + ' failures'}
          </Pill>
        </div>

      </div>

      {/* three trust cards */}
      <div className="rc-reliability-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16, maxWidth: 980 }}>
        {trustCards.map((card, i) => (
          <div key={i} className="rc-card rc-reliability-trust-card" style={{ padding: '18px 18px 17px' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: card.tone === 'good' ? 'var(--rc-good-soft)' : 'var(--rc-accent-soft)',
              color: card.tone === 'good' ? 'var(--rc-good-strong)' : 'var(--rc-accent-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
            }}><Icon name={card.icon} size={15}/></div>
            <div className="rc-serif" style={{ fontSize: 16, fontWeight: 500, color: 'var(--rc-fg-strong)', marginBottom: 4 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--rc-fg-muted)', lineHeight: 1.55 }}>{card.body}</div>
          </div>
        ))}
      </div>

      {/* source detail table */}
      <div style={{ marginTop: 28, maxWidth: 980 }}>
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
          {rel.sources.map(src => (
            <div key={src.id} style={{
              display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.95fr 0.7fr 0.7fr',
              padding: '13px 18px', alignItems: 'center', borderTop: '1px solid var(--rc-rule)', fontSize: 12.5,
            }}>
              <span style={{ color: 'var(--rc-fg-strong)', fontWeight: 500 }}>{src.name[lang]}</span>
              <span style={{ color: 'var(--rc-fg-muted)' }}>{src.sourceName || src.cadence[lang]}</span>
              <span className="rc-mono" style={{ color: 'var(--rc-fg-muted)', fontSize: 11.5 }}>{src.freshness}</span>
              <span className="rc-mono" style={{ color: 'var(--rc-fg-muted)', fontSize: 11.5 }}>{typeof src.durationMs === 'number' ? `${src.durationMs}ms` : '-'}</span>
              <span style={{ textAlign: 'right' }}>
                <Pill tone={src.status === 'ok' ? 'good' : 'warm'} size="sm">
                  {formatSourceStatus(src.status, src.reason, lang)}
                </Pill>
              </span>
            </div>
          ))}
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
      <div className="rc-card" style={{ marginTop: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 980 }}>
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
        background: 'var(--rc-surface-2)', maxWidth: 980, border: '1px solid var(--rc-rule)',
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

function formatSourceStatus(status: string, reason: string | null | undefined, lang: RcLang): string {
  if (status === 'ok') return lang === 'ko' ? '정상' : 'OK';
  if (status === 'failed') return lang === 'ko' ? '실패' : 'Failed';
  if (status === 'skipped') {
    const reasonText = reason ?? '';
    if (reasonText.includes('no_weather_items')) {
      return lang === 'ko' ? '관측 없음' : 'No observation';
    }
    if (reasonText.includes('secret') || reasonText.includes('credential')) {
      return lang === 'ko' ? '연동 대기' : 'Waiting';
    }
    if (reasonText.includes('permission')) {
      return lang === 'ko' ? '권한 필요' : 'Permission needed';
    }
    return lang === 'ko' ? '대기' : 'Waiting';
  }
  return lang === 'ko' ? '부분' : 'Partial';
}
