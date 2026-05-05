import { SCENARIO, tr, fmtPct } from './revenueCockpitCopy';
import { Icon, Pill, StrengthDots, Sparkline, StatePill, StateMenu, stateTone } from './revenueCockpitShared';
import { RevenueTrendChart } from './RevenueTrendChart';
import type { RcLang, RcScreen, ActionStatuses, ActionStatus, RcAction, CauseCandidate, Scenario } from './revenueCockpitTypes';

// ─── cause rail (compact row for right rail) ──────────────────────────────────

function CauseRail({ c, lang, rank, onOpen }: { c: CauseCandidate; lang: RcLang; rank: number; onOpen: () => void }) {
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
        <span className="rc-num" style={{ fontSize: 12, fontWeight: 600,
          color: c.delta < 0 ? 'var(--rc-bad-strong)' : 'var(--rc-accent-strong)' }}>
          {fmtPct(c.delta)}
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
  const days = lang === 'ko'
    ? [{k:'mon',d:'월'},{k:'tue',d:'화'},{k:'wed',d:'수'},{k:'thu',d:'목'},{k:'fri',d:'금'}]
    : [{k:'mon',d:'Mon'},{k:'tue',d:'Tue'},{k:'wed',d:'Wed'},{k:'thu',d:'Thu'},{k:'fri',d:'Fri'}];
  const dayFor: Record<string, number> = { 'rain-coupon': 0, 'stamp-card': 2, 'delivery-push': 4, 'instagram': 1, 'winter-set': 3, 'staff-rebalance': 0 };
  const byDay = days.map((_, i) => actions.filter((a, index) => (dayFor[a.id] ?? index % days.length) === i));
  const todayIdx = 0;

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
                {lang === 'ko' ? `12·${9+i}` : `Dec ${9+i}`}
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
            {lang === 'ko' ? '5개 데이터 모두 정상 · 최근 14회 실행 무실패' : '5/5 sources OK · 14 runs without failure'}
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
  const thisWeekActions = scenario.actions.filter(a => a.timeframe === 'this-week');
  const secondaryMetrics = [
    { lab: lang === 'ko' ? '거래건수'  : 'Transactions', v: '11.9k',  d: scenario.txnChange,        spark: [{v:100},{v:101},{v:99},{v:102},{v:104},{v:103},{v:100},{v:90}] },
    { lab: lang === 'ko' ? '객단가'    : 'Avg. ticket',  v: '₩6,450', d: scenario.ticketChange,     spark: [{v:100},{v:99},{v:101},{v:102},{v:101},{v:100},{v:100},{v:98}] },
    { lab: lang === 'ko' ? '생활인구'  : 'Foot traffic', v: '142k',   d: scenario.populationChange, spark: [{v:104},{v:103},{v:102},{v:101},{v:101},{v:100},{v:100},{v:91.6}] },
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
          {lang === 'ko' ? '이번 분기 매출 브리프' : 'This quarter — Revenue Brief'}
        </div>

        <h1 className="rc-serif rc-keep-words" style={{
          fontSize: 40, lineHeight: 1.16, letterSpacing: 0,
          margin: '16px 0 13px', color: 'var(--rc-fg-strong)', fontWeight: 400,
          maxWidth: 760,
        }}>
          {lang === 'ko'
            ? <>{scenario.compare.ko} 추정매출이 직전 분기 대비 <span style={{ color: 'var(--rc-accent-strong)' }}>{Math.abs(scenario.revenueChange).toFixed(1)}%</span> 줄었습니다.</>
            : <>Estimated revenue fell <span style={{ color: 'var(--rc-accent-strong)' }}>{Math.abs(scenario.revenueChange).toFixed(1)}%</span> from the prior quarter.</>}
        </h1>

        <p className="rc-keep-words" style={{ fontSize: 14.5, color: 'var(--rc-fg-muted)', maxWidth: 620, margin: '0 0 18px', lineHeight: 1.66 }}>
          {lang === 'ko'
            ? `거래건수 감소와 함께 관측되었습니다. 같은 기간 생활인구가 줄고 강수일수와 인근 점포수가 늘었습니다. 가능성 높은 원인 후보 ${scenario.causes.length}건과 이번 주 액션을 아래에서 확인해주세요.`
            : `Transaction count fell alongside revenue. Foot traffic softened, rainy days rose, and nearby café count grew. ${scenario.causes.length} likely cause candidates and this week's actions are below.`}
        </p>

        {/* chart card */}
        <div className="rc-card" style={{ padding: '16px 18px 12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                {lang === 'ko' ? '추정매출 지수 · 2024 Q3 = 100' : 'Estimated revenue index · 2024 Q3 = 100'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
                <span className="rc-serif rc-num" style={{ fontSize: 28, lineHeight: 1, color: 'var(--rc-fg-strong)', fontWeight: 500 }}>
                  ₩ 1,224<span style={{ fontSize: 16, color: 'var(--rc-fg-muted)' }}>M</span>
                </span>
                <span className="rc-num" style={{ fontSize: 13, color: 'var(--rc-bad-strong)', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="arrow-down" size={12}/> {fmtPct(scenario.revenueChange)} {tr('vsBaseline', lang)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['8Q', '4Q', 'YoY'].map((b, i) => (
                <button key={b} style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  color: i === 0 ? 'var(--rc-fg-strong)' : 'var(--rc-fg-muted)',
                  background: i === 0 ? 'var(--rc-surface-2)' : 'transparent',
                  border: i === 0 ? '1px solid var(--rc-rule)' : '1px solid transparent',
                }}>{b}</button>
              ))}
            </div>
          </div>
          <RevenueTrendChart lang={lang} scenario={scenario} height={174}/>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 8,
            borderTop: '1px dashed var(--rc-rule)', fontSize: 11.5, color: 'var(--rc-fg-muted)', lineHeight: 1.45 }}>
            <span style={{ color: 'var(--rc-accent-strong)', display: 'inline-flex', marginTop: 3 }}>
              <Icon name="shield" size={12}/>
            </span>
            {lang === 'ko'
              ? '이 신호는 매출 하락과 함께 관측된 원인 후보입니다. 인과관계를 확정하거나 매출 회복을 보장하지 않습니다.'
              : 'These signals were observed alongside the revenue drop. They do not prove causality or guarantee revenue recovery.'}
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
            <h2 className="rc-serif rc-keep-words" style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
              {lang === 'ko' ? '이번 주 실행 계획' : "This week's execution plan"}
            </h2>
            <button onClick={() => onNavigate('actions')} style={{
              all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--rc-accent-strong)',
              display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
            }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
          </div>
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
          <p style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', margin: '0 0 10px' }}>
            {lang === 'ko' ? `${scenario.causes.length}개 후보 · 신호 강함 순` : `${scenario.causes.length} candidates · sorted by signal strength`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {scenario.causes.map((c, i) => (
              <CauseRail key={c.id} c={c} lang={lang} rank={i+1} onOpen={() => onNavigate('evidence')}/>
            ))}
          </div>
        </div>

        {/* this week shortlist */}
        <div style={{
          border: '1px solid var(--rc-accent-soft-bd)', background: 'var(--rc-accent-soft)',
          borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--rc-shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 className="rc-serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--rc-accent-strong)' }}>
              {tr('thisWeek', lang)}
            </h2>
            <Pill tone="warm" size="sm">{Math.min(thisWeekActions.length, 3)} / {scenario.actions.length}</Pill>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenario.actions.filter(a => a.timeframe === 'this-week').slice(0, 3).map(a => (
              <ShortlistRow key={a.id} a={a} lang={lang}
                state={statuses[a.id] ?? 'recommended'}
                setState={st => onSetStatus(a.id, st)}/>
            ))}
          </div>
        </div>

        <ReliabilityCompact lang={lang} scenario={scenario} onOpen={() => onNavigate('reliability')}/>
      </aside>
    </div>
  );
}
