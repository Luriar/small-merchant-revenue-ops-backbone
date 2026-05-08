import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill, StatePill, StateMenu, DotMeter, STATES, stateTone } from './revenueCockpitShared';
import { resolveTrend } from './revenueTrendScenarios';
import { trendOrderedActions, trendActionsKicker } from './revenueActionPlannerLogic';
import type { RcLang, ActionStatuses, ActionStatus, RcAction, Scenario } from './revenueCockpitTypes';

function ActionCard({ a, lang, scenario, state, setState }: { a: RcAction; lang: RcLang; scenario: Scenario; state: ActionStatus; setState: (s: ActionStatus) => void }) {
  const tone = stateTone[state];
  const tiedCauses = a.tied.map(id => scenario.causes.find(c => c.id === id)).filter(Boolean) as typeof scenario.causes;
  const diffN = a.effort === 'low' ? 1 : a.effort === 'medium' ? 2 : 3;
  const impN  = a.impact === 'low' ? 1 : a.impact === 'medium' ? 2 : 3;

  return (
    <div className="rc-card" style={{
      borderLeft: `3px solid ${tone.fg}`,
      padding: '12px 12px 10px',
      display: 'flex', flexDirection: 'column', gap: 8,
      opacity: state === 'dismissed' ? 0.6 : 1,
    }}>
      <div className="rc-serif rc-prose" style={{
        fontSize: 14.5, fontWeight: 500, color: 'var(--rc-fg-strong)', lineHeight: 1.3,
        textDecoration: state === 'done' ? 'line-through' : 'none',
      }}>
        {a.title[lang]}
      </div>
      <div className="rc-prose" style={{ fontSize: 11.5, color: 'var(--rc-fg-muted)', lineHeight: 1.55 }}>{a.summary[lang]}</div>

      {/* difficulty & expected effect */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: 'var(--rc-surface-0)', border: '1px solid var(--rc-rule)',
      }}>
        <DotMeter label={lang === 'ko' ? '난이도' : 'Difficulty'} value={diffN} max={3} hint={tr(`effort_${a.effort}`, lang)}/>
        <DotMeter label={lang === 'ko' ? '예상 효과' : 'Expected effect'} value={impN} max={3} hint={tr(`impact_${a.impact}`, lang)} positive/>
      </div>

      {/* tied evidence — soft neutral pills, no heavy orange */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {lang === 'ko' ? '연결 근거' : 'Linked evidence'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tiedCauses.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--rc-fg-dim)' }}>
              {lang === 'ko' ? '근거 없음' : 'None'}
            </span>
          )}
          {tiedCauses.map(c => (
            <span key={c.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 9px 2px 7px', borderRadius: 999,
              background: 'var(--rc-surface-2)', color: 'var(--rc-fg)',
              border: '1px solid var(--rc-rule)',
              fontSize: 10.5, fontWeight: 500,
            }}>
              <Icon name={c.icon} size={10}/> {c.title[lang]}
            </span>
          ))}
        </div>
      </div>

      {/* steps */}
      <ol style={{ margin: '2px 0 0', padding: '0 0 0 16px', fontSize: 11, color: 'var(--rc-fg)', lineHeight: 1.55 }}>
        {a.steps.map((s, i) => <li key={i}>{s[lang]}</li>)}
      </ol>

      {/* state + cycle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <StatePill state={state} lang={lang} size="sm"/>
        <StateMenu state={state} setState={setState} lang={lang} align="right"/>
      </div>
    </div>
  );
}

interface ActionPlannerViewProps {
  lang: RcLang;
  scenario?: Scenario;
  statuses: ActionStatuses;
  onSetStatus: (id: string, status: ActionStatus) => void;
}

export function ActionPlannerView({ lang, scenario = SCENARIO, statuses, onSetStatus }: ActionPlannerViewProps) {
  const orderedActions = trendOrderedActions(scenario);
  const trend = resolveTrend(scenario);
  const groups = STATES.map(s => ({
    key: s,
    items: orderedActions.filter(a => (statuses[a.id] ?? 'recommended') === s),
  }));

  return (
    <div className="rc-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="rc-serif" style={{ fontSize: 28, fontWeight: 500, margin: 0, color: 'var(--rc-fg-strong)' }}>
            {tr('navActions', lang)}
          </h1>
          <p className="rc-prose" style={{ fontSize: 13.5, color: 'var(--rc-fg-muted)', marginTop: 6, lineHeight: 1.65 }}>
            {trendActionsKicker(trend, lang)}
            {' · '}
            {lang === 'ko'
              ? `근거 후보에 연결된 추천 액션 ${orderedActions.length}건입니다. 본인 매장에 맞춰 검토 후 결정해 주세요.`
              : `${orderedActions.length} actions linked to evidence — review and decide what fits your shop.`}
          </p>
        </div>
        <div style={{ flexShrink: 0, paddingTop: 6 }}>
          <Pill tone="quiet">{lang === 'ko' ? `${orderedActions.length}개 추천` : `${orderedActions.length} recommended`}</Pill>
        </div>
      </div>

      {/* status flow legend */}
      <div className="rc-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, padding: '10px 14px' }}>
        <span style={{ fontSize: 10.5, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', alignSelf: 'center', marginRight: 4 }}>
          {lang === 'ko' ? '상태 흐름' : 'Status flow'}
        </span>
        {STATES.map((s, i) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatePill state={s} lang={lang}/>
            {i < STATES.length - 1 && <span style={{ color: 'var(--rc-fg-dim)', display: 'inline-flex' }}><Icon name="arrow-right" size={11}/></span>}
          </span>
        ))}
      </div>

      {/* kanban — compact empty state, no oversized blank columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
        {groups.map(g => (
          <div key={g.key} style={{
            border: '1px solid var(--rc-rule)', borderRadius: 10, background: 'var(--rc-surface-0)',
            padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <StatePill state={g.key} lang={lang}/>
              <span className="rc-mono" style={{ fontSize: 10, color: 'var(--rc-fg-dim)' }}>{g.items.length}</span>
            </div>
            {g.items.length === 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'var(--rc-fg-dim)',
                border: '1px dashed var(--rc-rule)', borderRadius: 7, padding: '8px 10px', textAlign: 'center',
                minHeight: 36,
              }}>
                {lang === 'ko' ? '비어있음' : 'Empty'}
              </div>
            )}
            {g.items.map(a => (
              <ActionCard key={a.id} a={a} lang={lang} scenario={scenario}
                state={statuses[a.id] ?? 'recommended'}
                setState={st => onSetStatus(a.id, st)}/>
            ))}
          </div>
        ))}
      </div>

      {/* disclaimer */}
      <p style={{ marginTop: 24, fontSize: 11.5, color: 'var(--rc-fg-dim)', lineHeight: 1.6, maxWidth: 800 }}>
        {tr('disclaimer', lang)}
      </p>
    </div>
  );
}
