import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill } from './revenueCockpitShared';
import type { RcLang, Scenario } from './revenueCockpitTypes';

interface DataReliabilityViewProps { lang: RcLang; scenario?: Scenario }

export function DataReliabilityView({ lang, scenario = SCENARIO }: DataReliabilityViewProps) {
  const rel = scenario.reliability;

  const trustCards = [
    {
      icon: 'check', tone: 'good',
      title: lang === 'ko' ? `${rel.sources.length}개 데이터 상태 확인` : `${rel.sources.length} sources checked`,
      body:  lang === 'ko' ? '예정된 주기로 모두 갱신되었습니다.' : 'Each refreshed on its scheduled cadence.',
    },
    {
      icon: 'spark2', tone: 'good',
      title: lang === 'ko' ? '최근 14회 실행 무실패' : 'Last 14 runs · no failures',
      body:  lang === 'ko' ? '계산이 안정적으로 마쳤습니다.' : 'Computations completed cleanly.',
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
        <h1 className="rc-serif" style={{ fontSize: 32, fontWeight: 400, margin: '10px 0 12px', color: 'var(--rc-fg-strong)', letterSpacing: '-0.01em' }}>
          {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--rc-fg-muted)', lineHeight: 1.65, margin: 0 }}>
          {lang === 'ko'
            ? '이 브리프는 5개의 공공·결제 데이터를 매일 자동으로 갱신해 만들어집니다. 모든 데이터가 정상 갱신되었고, 최근 14회 실행에서 실패가 없었습니다. 분석은 상권/업종 단위 추정치이며, 결과는 함께 관측된 신호를 정리한 것이지 인과관계를 확정한 것이 아닙니다.'
            : 'This brief is built from five public and payment datasets that refresh daily. All sources are healthy, and the last 14 runs completed without failure. Analysis is at the trade-area / category level — results summarize signals that moved together, not proven causes.'}
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
            display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1.1fr 0.7fr',
            padding: '11px 18px', fontSize: 10.5, color: 'var(--rc-fg-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'var(--rc-surface-2)',
          }}>
            <span>{lang === 'ko' ? '데이터 소스' : 'Source'}</span>
            <span>{tr('cadence', lang)}</span>
            <span>{tr('freshAsOf', lang)}</span>
            <span>{tr('coverage', lang)}</span>
            <span style={{ textAlign: 'right' }}>{lang === 'ko' ? '상태' : 'Status'}</span>
          </div>
          {rel.sources.map(src => (
            <div key={src.id} style={{
              display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1.1fr 0.7fr',
              padding: '13px 18px', alignItems: 'center', borderTop: '1px solid var(--rc-rule)', fontSize: 12.5,
            }}>
              <span style={{ color: 'var(--rc-fg-strong)', fontWeight: 500 }}>{src.name[lang]}</span>
              <span style={{ color: 'var(--rc-fg-muted)' }}>{src.cadence[lang]}</span>
              <span className="rc-mono" style={{ color: 'var(--rc-fg-muted)', fontSize: 11.5 }}>{src.freshness}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 80, height: 5, borderRadius: 3, background: 'var(--rc-surface-2)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: src.coverage + '%', height: '100%',
                    background: src.status === 'ok' ? 'var(--rc-good)' : 'var(--rc-accent)' }}/>
                </span>
                <span className="rc-num" style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)' }}>{src.coverage}%</span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <Pill tone={src.status === 'ok' ? 'good' : 'warm'} size="sm">
                  {src.status === 'ok' ? (lang === 'ko' ? '정상' : 'OK') : (lang === 'ko' ? '부분' : 'Partial')}
                </Pill>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* run info */}
      <div className="rc-card" style={{ marginTop: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 980 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--rc-good-soft)', color: 'var(--rc-good-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="check" size={13}/></span>
        <div style={{ fontSize: 13, color: 'var(--rc-fg)' }}>
          <strong>{lang === 'ko' ? `최근 ${rel.runs}회 실행 · 실패 ${rel.failures}` : `Last ${rel.runs} runs · ${rel.failures} failures`}</strong>
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
