import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill } from './revenueCockpitShared';
import type { RcLang, Scenario } from './revenueCockpitTypes';

interface DataReliabilityViewProps { lang: RcLang; scenario?: Scenario }

export function DataReliabilityView({ lang, scenario = SCENARIO }: DataReliabilityViewProps) {
  const rel = scenario.reliability;
  const partial = rel.failures > 0 || rel.sources.some(source => source.status === 'failed' || source.status === 'partial');
  const healthyCollectorCount = rel.sources.filter(source => source.status === 'ok').length;
  const latestRunCopy = lang === 'ko' && rel.failures === 0 && healthyCollectorCount > 0
    ? `${healthyCollectorCount}개 맥락데이터 정상 수집 · 최근 실행 실패 없음`
    : lang === 'ko'
      ? `최근 ${rel.runs}회 실행 · 실패 ${rel.failures}`
      : `Last ${rel.runs} runs · ${rel.failures} failures`;

  const trustCards = [
    {
      icon: partial ? 'shield' : 'check', tone: partial ? 'warm' : 'good',
      title: lang === 'ko' ? `${rel.sources.length}개 수집기 상태 확인` : `${rel.sources.length} collectors checked`,
      body:  partial
        ? (lang === 'ko' ? '일부 맥락데이터 수집이 지연되었습니다.' : 'Some context collection is delayed.')
        : (lang === 'ko' ? '최근 수집 결과가 정상 범위입니다.' : 'Latest collection is in a healthy range.'),
    },
    {
      icon: 'spark2', tone: partial ? 'warm' : 'good',
      title: lang === 'ko' ? latestRunCopy : `Latest run · ${rel.failures} failures`,
      body:  lang === 'ko' ? '현재 수집된 데이터만으로 초기 분석을 시작할 수 있습니다.' : 'The current data is enough to start an initial analysis.',
    },
    {
      icon: 'shield', tone: 'warm',
      title: lang === 'ko' ? '추정치임을 잊지 마세요' : 'Remember — estimates',
      body:  lang === 'ko' ? '상권/업종 단위 추정이며, 우리 매장 매출 자체가 아닙니다.' : "Trade-area estimates, not your store's direct sales.",
    },
  ];

  return (
    <div style={{ padding: '32px 40px 44px' }}>
      {/* headline */}
      <div style={{ maxWidth: 760 }}>
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
      </div>

      {/* three trust cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 22, maxWidth: 980 }}>
        {trustCards.map((card, i) => (
          <div key={i} className="rc-card" style={{ padding: '16px 18px' }}>
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
            {lang === 'ko' ? '· 기술 정보' : '· technical'}
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
  if (status === 'failed') return lang === 'ko' ? '지연' : 'Delayed';
  if (status === 'skipped') {
    const reasonText = reason ?? '';
    if (reasonText.includes('secret') || reasonText.includes('credential')) {
      return lang === 'ko' ? '연동 대기' : 'Waiting';
    }
    if (reasonText.includes('permission')) {
      return lang === 'ko' ? '권한 필요' : 'Permission needed';
    }
    return lang === 'ko' ? '설정 필요' : 'Setup needed';
  }
  return lang === 'ko' ? '부분' : 'Partial';
}
