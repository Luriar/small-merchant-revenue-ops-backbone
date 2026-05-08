import type { CauseCandidate, RcAction, Scenario } from './revenueCockpitTypes';
import { resolveTrend, type RevenueTrend } from './revenueTrendScenarios';

// Stable family key so duplicate variants of the same action template render
// only once. Falls back to id, then a normalized title.
function actionFamily(action: RcAction): string {
  if (action.id) return action.id;
  const normalizedTitle = action.title.ko.replace(/\s+/g, '').toLowerCase();
  return `${action.type}::${normalizedTitle}`;
}

export interface DedupedAction extends RcAction {
  // Tied causes after merge — superset across duplicate variants.
  tied: string[];
}

// Merge duplicate action cards by family key, unioning their tied evidence.
export function dedupeActions(actions: RcAction[]): DedupedAction[] {
  const byFamily = new Map<string, DedupedAction>();
  for (const action of actions) {
    const key = actionFamily(action);
    const existing = byFamily.get(key);
    if (existing) {
      const merged = new Set([...existing.tied, ...action.tied]);
      existing.tied = Array.from(merged);
      continue;
    }
    byFamily.set(key, { ...action, tied: [...new Set(action.tied)] });
  }
  return Array.from(byFamily.values());
}

// Build a "linked evidence" copy line from the action's tied causes.
export function linkedEvidenceCopy(action: RcAction, causes: CauseCandidate[], lang: 'ko' | 'en'): string {
  const labels = action.tied
    .map(id => causes.find(c => c.id === id)?.title[lang])
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return '';
  return lang === 'ko'
    ? `연결 근거: ${labels.join(' · ')}`
    : `Linked evidence: ${labels.join(' · ')}`;
}

// Trend-aware action ordering and minimum diversity.
const PREFERRED_ACTION_ORDER: Record<RevenueTrend, string[]> = {
  down: ['rain-coupon', 'stamp-card', 'delivery-push', 'winter-set', 'instagram', 'staff-rebalance'],
  up:   ['maintain-set', 'stockout-prevent', 'expand-set', 'repeat-validate', 'newcustomer-retain', 'event-hedge'],
  flat: ['repeat-validate', 'maintain-set', 'instagram', 'stamp-card'],
};

export function trendOrderedActions(scenario: Scenario): DedupedAction[] {
  const deduped = dedupeActions(scenario.actions);
  const trend = resolveTrend(scenario);
  const order = PREFERRED_ACTION_ORDER[trend];
  return [...deduped].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === bi) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function trendActionsKicker(trend: RevenueTrend, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    if (trend === 'up')   return '유지 · 확대 · 검증 · 헷지 액션 후보';
    if (trend === 'down') return '회복 · 진단 · 방어 · 빠른 실험 액션 후보';
    return '관찰 유지 · 작은 실험 후보';
  }
  if (trend === 'up')   return 'Maintain · amplify · validate · hedge action candidates';
  if (trend === 'down') return 'Recovery · diagnosis · defense · quick-experiment candidates';
  return 'Monitor · small-experiment candidates';
}
