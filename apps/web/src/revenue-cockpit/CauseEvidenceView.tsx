import { useEffect, useState } from 'react';
import { SCENARIO, tr, fmtPct } from './revenueCockpitCopy';
import { Icon, Pill, StrengthDots } from './revenueCockpitShared';
import type { RcLang, CauseCandidate, Scenario } from './revenueCockpitTypes';

interface CompareBlock {
  primary: {
    label: { ko: string; en: string };
    base: { v: string; sub: { ko: string; en: string } };
    comp: { v: string; sub: { ko: string; en: string } };
    delta: number;
    unit: { ko: string; en: string };
  };
  linked: Array<{ label: { ko: string; en: string }; delta: number; hint: { ko: string; en: string } }>;
  sources: Array<{ name: { ko: string; en: string }; plain: { ko: string; en: string } }>;
}

const compareBlocks: Record<string, CompareBlock> = {
  demand: {
    primary: {
      label: { ko: '평균 생활인구 (분기)', en: 'Mean foot traffic (quarter)' },
      base:  { v: '155,200', sub: { ko: '24년 3분기', en: '2024 Q3' } },
      comp:  { v: '142,100', sub: { ko: '24년 4분기', en: '2024 Q4' } },
      delta: -8.4,
      unit:  { ko: '명/일', en: 'people/day' },
    },
    linked: [
      { label: { ko: '거래건수', en: 'Transactions' }, delta: -10.2, hint: { ko: '함께 감소', en: 'fell together' } },
      { label: { ko: '추정매출', en: 'Revenue' },      delta: -12.0, hint: { ko: '함께 감소', en: 'fell together' } },
    ],
    sources: [
      { name: { ko: '서울 생활인구 (SKT)',  en: 'Seoul Floating Population (SKT)' }, plain: { ko: '시간대별 인구 추정', en: 'Hourly population estimate' } },
      { name: { ko: '추정매출 시그널',      en: 'Revenue signal' },                  plain: { ko: '카드 결제 기반',     en: 'Card-payment based' } },
    ],
  },
  weather: {
    primary: {
      label: { ko: '강수일수 (분기)', en: 'Rainy days (quarter)' },
      base:  { v: '14', sub: { ko: '24년 3분기', en: '2024 Q3' } },
      comp:  { v: '18', sub: { ko: '24년 4분기', en: '2024 Q4' } },
      delta: +28.0,
      unit:  { ko: '일', en: 'days' },
    },
    linked: [
      { label: { ko: '비 오는 날 거래', en: 'Txn on rainy days' }, delta: -16.4, hint: { ko: '강한 음의 상관', en: 'strong negative corr.' } },
      { label: { ko: '맑은 날 거래',    en: 'Txn on clear days' }, delta: -3.1,  hint: { ko: '약한 변화',     en: 'minor change' } },
    ],
    sources: [
      { name: { ko: '기상청 ASOS · 서울', en: 'KMA ASOS · Seoul' }, plain: { ko: '관측소 일별 강수', en: 'Daily station data' } },
    ],
  },
  competition: {
    primary: {
      label: { ko: '인근 카페 점포수', en: 'Nearby café count' },
      base:  { v: '198', sub: { ko: '24년 3분기 평균', en: 'avg. Q3' } },
      comp:  { v: '210', sub: { ko: '24년 4분기 평균', en: 'avg. Q4' } },
      delta: +6.1,
      unit:  { ko: '개소', en: 'venues' },
    },
    linked: [
      { label: { ko: '단골 방문빈도',  en: 'Regular visit freq.' }, delta: -4.3, hint: { ko: '소폭 감소', en: 'slightly down' } },
      { label: { ko: '신규 고객 비율', en: 'New-customer share' }, delta: -2.0, hint: { ko: '소폭 감소', en: 'slightly down' } },
    ],
    sources: [
      { name: { ko: '업종별 인허가 현황', en: 'Permitted business registry' }, plain: { ko: '구청 공개자료', en: 'District-office data' } },
    ],
  },
  context: {
    primary: {
      label: { ko: '공휴일 수 (분기)', en: 'Public holidays (quarter)' },
      base:  { v: '7', sub: { ko: '24년 3분기', en: '2024 Q3' } },
      comp:  { v: '6', sub: { ko: '24년 4분기', en: '2024 Q4' } },
      delta: -14.3,
      unit:  { ko: '일', en: 'days' },
    },
    linked: [
      { label: { ko: '공휴일 매출 비중', en: 'Holiday share of rev.' }, delta: -1.1, hint: { ko: '미미한 변화', en: 'marginal' } },
    ],
    sources: [
      { name: { ko: '공휴일·이벤트 캘린더', en: 'Holidays & events calendar' }, plain: { ko: '연간 공식 캘린더', en: 'Annual calendar' } },
    ],
  },
};

function fallbackCompareBlock(cause: CauseCandidate, scenario: Scenario): CompareBlock {
  return {
    primary: {
      label: cause.title,
      base: { v: '100', sub: scenario.base },
      comp: { v: (100 + cause.delta).toFixed(1), sub: scenario.compare },
      delta: cause.delta,
      unit: { ko: '지수', en: 'index' },
    },
    linked: [
      { label: { ko: '추정매출', en: 'Revenue' }, delta: scenario.revenueChange, hint: { ko: '함께 관측', en: 'observed together' } },
      { label: { ko: '거래건수', en: 'Transactions' }, delta: scenario.txnChange, hint: { ko: '함께 관측', en: 'observed together' } },
    ],
    sources: cause.sources.map(source => ({
      name: { ko: source, en: source },
      plain: { ko: 'Gold export 기반 신호', en: 'Signal from Gold export' },
    })),
  };
}

interface CauseEvidenceViewProps { lang: RcLang; scenario?: Scenario }

export function CauseEvidenceView({ lang, scenario = SCENARIO }: CauseEvidenceViewProps) {
  const [activeId, setActiveId] = useState(scenario.causes[0].id);
  const cause = scenario.causes.find(x => x.id === activeId) ?? scenario.causes[0];
  const block = compareBlocks[cause.id] ?? fallbackCompareBlock(cause, scenario);

  useEffect(() => {
    setActiveId(scenario.causes[0].id);
  }, [scenario]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '100%' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{ borderRight: '1px solid var(--rc-rule)', padding: '28px 0', background: 'var(--rc-surface-0)' }}>
        <div style={{ padding: '0 24px 14px' }}>
          <div className="rc-serif" style={{ fontSize: 22, color: 'var(--rc-fg-strong)', fontWeight: 500 }}>
            {tr('causeLabel', lang)}
          </div>
          <p style={{ fontSize: 12, color: 'var(--rc-fg-muted)', marginTop: 4 }}>
            {lang === 'ko' ? '신호 강도 순서로 정렬했어요.' : 'Sorted by signal strength.'}
          </p>
        </div>
        {scenario.causes.map((cs, i) => (
          <button key={cs.id} onClick={() => setActiveId(cs.id)} style={{
            all: 'unset', cursor: 'pointer', display: 'grid',
            gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
            padding: '12px 24px', width: '100%', boxSizing: 'border-box',
            borderLeft: activeId === cs.id ? '2px solid var(--rc-accent)' : '2px solid transparent',
            background: activeId === cs.id ? 'var(--rc-surface-2)' : 'transparent',
          }}>
            <span className="rc-mono" style={{ fontSize: 11, color: 'var(--rc-fg-dim)' }}>0{i+1}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--rc-fg-strong)' }}>{cs.title[lang]}</div>
              <div style={{ fontSize: 11, color: 'var(--rc-fg-muted)', marginTop: 1 }}>{tr(`strength_${cs.strength}`, lang)}</div>
            </div>
            <span style={{ color: 'var(--rc-fg-muted)' }}><StrengthDots level={cs.strength}/></span>
          </button>
        ))}

        <div style={{ padding: '16px 24px 0' }}>
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-accent-soft-bd)',
            fontSize: 11.5, color: 'var(--rc-accent-strong)', lineHeight: 1.55,
          }}>
            <Icon name="shield" size={11}/> &nbsp;
            {lang === 'ko'
              ? '함께 관측되었다는 사실이 인과관계를 의미하지 않습니다. 추가 확인이 필요합니다.'
              : 'Observed together does not mean causation — needs further confirmation.'}
          </div>
        </div>
      </aside>

      {/* ── DETAIL ── */}
      <main style={{ padding: '32px 40px 44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
          <Icon name={cause.icon} size={12}/> {tr(`strength_${cause.strength}`, lang)} · {tr('observedTogether', lang)}
        </div>
        <h1 className="rc-serif" style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 400, margin: '10px 0 6px', color: 'var(--rc-fg-strong)' }}>
          {cause.title[lang]}
        </h1>
        <p className="rc-serif" style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--rc-fg)', margin: '0 0 12px', fontStyle: 'italic', maxWidth: 720 }}>
          "{cause.headline[lang]}"
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--rc-fg-muted)', maxWidth: 720, lineHeight: 1.65, marginTop: 0 }}>{cause.body[lang]}</p>

        {/* baseline vs compare card */}
        <div className="rc-card" style={{ marginTop: 22, padding: '20px 22px', boxShadow: 'var(--rc-shadow-sm)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 14 }}>
            {lang === 'ko' ? '관측된 지표 비교' : 'Observed metric comparison'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'stretch', gap: 18 }}>
            {/* baseline */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--rc-surface-2)', border: '1px solid var(--rc-rule)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rc-fg-muted)' }}/>
                {tr('baselineLabel', lang)} · {block.primary.base.sub[lang]}
              </div>
              <div className="rc-serif rc-num" style={{ fontSize: 32, fontWeight: 500, color: 'var(--rc-fg-strong)', marginTop: 6, lineHeight: 1 }}>
                {block.primary.base.v}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', marginTop: 4 }}>{block.primary.label[lang]} · {block.primary.unit[lang]}</div>
            </div>
            {/* arrow + delta */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 4px' }}>
              <Icon name="arrow-right" size={18}/>
              <span className="rc-num" style={{ fontSize: 14, fontWeight: 700,
                color: block.primary.delta < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-accent-strong)' }}>
                {fmtPct(block.primary.delta)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--rc-fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {lang === 'ko' ? '변화량' : 'Change'}
              </span>
            </div>
            {/* compare */}
            <div style={{ padding: '14px 16px', borderRadius: 10,
              background: block.primary.delta < 0 ? 'var(--rc-bad-soft)' : 'var(--rc-accent-soft)',
              border: `1px solid ${block.primary.delta < 0 ? 'var(--rc-bad-soft-bd)' : 'var(--rc-accent-soft-bd)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                color: block.primary.delta < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-accent-strong)',
                textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}/>
                {tr('compareLabel', lang)} · {block.primary.comp.sub[lang]}
              </div>
              <div className="rc-serif rc-num" style={{ fontSize: 32, fontWeight: 500,
                color: block.primary.delta < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-accent-strong)',
                marginTop: 6, lineHeight: 1 }}>
                {block.primary.comp.v}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', marginTop: 4 }}>{block.primary.label[lang]} · {block.primary.unit[lang]}</div>
            </div>
          </div>
        </div>

        {/* linked metrics */}
        <div className="rc-card" style={{ marginTop: 14, padding: '18px 22px', boxShadow: 'var(--rc-shadow-sm)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 6 }}>
            {lang === 'ko' ? '연관 지표 · 함께 관측되었습니다' : 'Linked metrics · observed together'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--rc-fg-muted)', margin: '0 0 12px', maxWidth: 600 }}>
            {lang === 'ko'
              ? '이 후보가 관측된 같은 기간 동안의 매출/거래 관련 지표 변화입니다.'
              : 'How revenue and transaction signals moved over the same period.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.linked.length}, 1fr)`, gap: 10 }}>
            {block.linked.map((m, i) => (
              <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--rc-rule)', borderRadius: 10, background: 'var(--rc-surface-0)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', marginBottom: 6 }}>{m.label[lang]}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="rc-num rc-serif" style={{ fontSize: 22, fontWeight: 500,
                    color: m.delta < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-good-strong)' }}>{fmtPct(m.delta)}</span>
                  <span style={{ fontSize: 11, color: 'var(--rc-fg-dim)' }}>{m.hint[lang]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* sources */}
        <div className="rc-card" style={{ marginTop: 14, padding: '18px 22px', boxShadow: 'var(--rc-shadow-sm)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>
            {tr('howWeKnow', lang)}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {block.sources.map((src, i) => (
              <li key={i} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                gap: 12, alignItems: 'center', padding: '8px 12px',
                background: 'var(--rc-surface-0)', border: '1px solid var(--rc-rule)', borderRadius: 8,
              }}>
                <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--rc-surface-2)',
                  color: 'var(--rc-fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="doc" size={13}/>
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rc-fg-strong)' }}>{src.name[lang]}</div>
                  <div style={{ fontSize: 11, color: 'var(--rc-fg-muted)', marginTop: 1 }}>{src.plain[lang]}</div>
                </div>
                <Pill tone="good" size="sm">{lang === 'ko' ? '정상' : 'OK'}</Pill>
              </li>
            ))}
          </ul>
        </div>

        {/* caution note */}
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'var(--rc-surface-2)', border: '1px solid var(--rc-rule)',
          fontSize: 12, color: 'var(--rc-fg-muted)', lineHeight: 1.6,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Icon name="shield" size={14}/>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--rc-fg)', marginBottom: 2 }}>
              {lang === 'ko' ? '인과관계가 확정된 것은 아닙니다.' : 'This is not a proven cause.'}
            </div>
            {lang === 'ko'
              ? '두 지표가 함께 움직였다는 관측이며, 한쪽이 다른 쪽을 일으켰다고 단정할 수 없습니다. 다른 후보와 함께 검토 후 액션을 결정해주세요.'
              : "The two signals moved together — that doesn't prove one caused the other. Review alongside other candidates before deciding actions."}
          </div>
        </div>
      </main>
    </div>
  );
}
