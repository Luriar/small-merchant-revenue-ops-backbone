import { SCENARIO, tr } from './revenueCockpitCopy';
import { Icon, Pill, StatePill, StateMenu, DotMeter, STATES, stateTone } from './revenueCockpitShared';
import { resolveTrend } from './revenueTrendScenarios';
import { trendOrderedActions, trendActionsKicker } from './revenueActionPlannerLogic';
import { computeActionOutcome, outcomeStatusLabel, outcomeNote } from './revenueActionOutcome';
import type { ActionCompletedAtMap, ActionOutcome, ActionOutcomeStatus } from './revenueActionOutcome';
import type { RcLang, ActionStatuses, ActionStatus, RcAction, Scenario } from './revenueCockpitTypes';

function fmtSignedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function fmtKRWCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `₩${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₩${Math.round(value / 1000)}K`;
  return `₩${Math.round(value)}`;
}

function outcomeTone(status: ActionOutcomeStatus): 'good' | 'bad' | 'warm' | 'quiet' {
  if (status === 'positive') return 'good';
  if (status === 'negative') return 'bad';
  if (status === 'observing') return 'warm';
  return 'quiet';
}

function OutcomeBlock({
  outcome,
  lang,
  onChangeCompletedDate,
}: {
  outcome: ActionOutcome;
  lang: RcLang;
  onChangeCompletedDate: (isoDate: string) => void;
}) {
  const tone = outcomeTone(outcome.status);
  const showDeltas = outcome.status === 'positive' || outcome.status === 'negative' || outcome.status === 'neutral';
  return (
    <div style={{
      marginTop: 4, padding: '8px 10px',
      border: '1px solid var(--rc-rule)', borderRadius: 8,
      background: 'var(--rc-surface-2)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {lang === 'ko' ? '결과 추적' : 'Outcome tracking'}
        </span>
        <Pill tone={tone} size="sm">{outcomeStatusLabel(outcome.status, lang)}</Pill>
      </div>
      <div style={{ fontSize: 11, color: 'var(--rc-fg-muted)', lineHeight: 1.5 }}>
        {outcomeNote(outcome.status, lang)}
      </div>
      {/* Inline completion-date editor — lets the user re-anchor the 7-day
          before/after window when the demo dataset doesn't include 7 days
          after today. Recompute is automatic via React state. */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10.5, color: 'var(--rc-fg-muted)',
      }}>
        <span>{lang === 'ko' ? '완료일' : 'Completed date'}</span>
        <input
          type="date"
          value={outcome.completedDate}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(next)) onChangeCompletedDate(next);
          }}
          style={{
            fontFamily: 'var(--rc-mono)', fontSize: 11,
            color: 'var(--rc-fg)', background: 'var(--rc-surface-1)',
            border: '1px solid var(--rc-rule)', borderRadius: 6,
            padding: '2px 6px', cursor: 'pointer',
            colorScheme: 'light dark',
          }}
          aria-label={lang === 'ko' ? '완료일 수정' : 'Edit completed date'}
        />
      </label>
      {showDeltas && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--rc-fg)' }}>
            <div style={{ color: 'var(--rc-fg-muted)', fontSize: 10 }}>
              {lang === 'ko' ? '매출 변화' : 'Sales change'}
            </div>
            <span className="rc-num" style={{
              fontWeight: 600,
              color: outcome.salesDeltaPct === null
                ? 'var(--rc-fg-dim)'
                : outcome.salesDeltaPct >= 0 ? 'var(--rc-good-strong)' : 'var(--rc-bad-strong)',
            }}>
              {fmtSignedPct(outcome.salesDeltaPct)}
            </span>
            <span style={{ color: 'var(--rc-fg-dim)', marginLeft: 6 }}>
              {fmtKRWCompact(outcome.beforeAvgSales)} → {fmtKRWCompact(outcome.afterAvgSales)}
            </span>
          </div>
          {outcome.orderDeltaPct !== null && (
            <div style={{ fontSize: 11, color: 'var(--rc-fg)' }}>
              <div style={{ color: 'var(--rc-fg-muted)', fontSize: 10 }}>
                {lang === 'ko' ? '거래건수 변화' : 'Order change'}
              </div>
              <span className="rc-num" style={{
                fontWeight: 600,
                color: outcome.orderDeltaPct >= 0 ? 'var(--rc-good-strong)' : 'var(--rc-bad-strong)',
              }}>
                {fmtSignedPct(outcome.orderDeltaPct)}
              </span>
              {outcome.ticketDeltaPct !== null && (
                <span style={{ color: 'var(--rc-fg-dim)', marginLeft: 6 }}>
                  {lang === 'ko' ? '객단가' : 'Ticket'} {fmtSignedPct(outcome.ticketDeltaPct)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--rc-fg-dim)' }}>
        {lang === 'ko'
          ? `전 ${outcome.beforeDays}일 / 후 ${outcome.afterDays}일 · 실행일 기준 결과를 다시 계산합니다.`
          : `Before ${outcome.beforeDays}d / after ${outcome.afterDays}d · recalculates the outcome from this date.`}
      </div>
    </div>
  );
}

function ActionCard({
  a, lang, scenario, state, setState, completedDate, onChangeCompletedDate,
}: {
  a: RcAction;
  lang: RcLang;
  scenario: Scenario;
  state: ActionStatus;
  setState: (s: ActionStatus) => void;
  completedDate: string | undefined;
  onChangeCompletedDate: (isoDate: string) => void;
}) {
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

      {/* outcome tracking — visible only after completion. Shows observing /
          insufficient_data while the 7-day window is still gathering, and a
          before/after delta once both windows have ≥3 days of data. */}
      {state === 'done' && completedDate && (
        <OutcomeBlock
          outcome={computeActionOutcome(scenario.uploadedDailySeries, completedDate)}
          lang={lang}
          onChangeCompletedDate={onChangeCompletedDate}
        />
      )}
    </div>
  );
}

interface ActionPlannerViewProps {
  lang: RcLang;
  scenario?: Scenario;
  statuses: ActionStatuses;
  onSetStatus: (id: string, status: ActionStatus) => void;
  actionCompletedAt?: ActionCompletedAtMap;
  onSetCompletedDate?: (id: string, isoDate: string) => void;
}

export function ActionPlannerView({
  lang,
  scenario = SCENARIO,
  statuses,
  onSetStatus,
  actionCompletedAt = {},
  onSetCompletedDate,
}: ActionPlannerViewProps) {
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
                setState={st => onSetStatus(a.id, st)}
                completedDate={actionCompletedAt[a.id]}
                onChangeCompletedDate={(isoDate) => onSetCompletedDate?.(a.id, isoDate)}/>
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
