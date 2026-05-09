// Frontend-side action outcome tracking. Stores per-action completion dates
// in localStorage (per store) and computes a before/after window summary
// against the normalized uploaded daily series. The "outcome" never claims
// causality — it only reports what was observed after the action.

import type { UploadedDailyRevenuePoint } from './revenueCockpitTypes';

export type ActionOutcomeStatus =
  | 'unknown'
  | 'observing'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'insufficient_data';

export interface ActionOutcome {
  status: ActionOutcomeStatus;
  completedDate: string;        // YYYY-MM-DD
  windowDays: number;
  beforeDays: number;
  afterDays: number;
  beforeAvgSales: number;
  afterAvgSales: number;
  salesDeltaPct: number | null;
  beforeAvgOrders: number | null;
  afterAvgOrders: number | null;
  orderDeltaPct: number | null;
  beforeAvgTicket: number | null;
  afterAvgTicket: number | null;
  ticketDeltaPct: number | null;
}

export type ActionCompletedAtMap = Record<string, string>;

const STORAGE_PREFIX = 'rc-action-completed-at';
const DEFAULT_WINDOW = 7;
const MIN_AFTER_DAYS = 3;
const MIN_BEFORE_DAYS = 3;

export function completedAtStorageKey(storeId: string | null | undefined): string {
  return `${STORAGE_PREFIX}:${storeId ?? '__none__'}`;
}

export function loadActionCompletedAt(storeId: string | null | undefined): ActionCompletedAtMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(completedAtStorageKey(storeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const map: ActionCompletedAtMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        map[key] = value;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function saveActionCompletedAt(storeId: string | null | undefined, map: ActionCompletedAtMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(completedAtStorageKey(storeId), JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function avg(points: UploadedDailyRevenuePoint[], pick: (p: UploadedDailyRevenuePoint) => number): { avg: number; count: number } {
  if (points.length === 0) return { avg: 0, count: 0 };
  const sum = points.reduce((s, p) => s + (Number.isFinite(pick(p)) ? pick(p) : 0), 0);
  return { avg: sum / points.length, count: points.length };
}

function pctDelta(before: number, after: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return null;
  return ((after - before) / before) * 100;
}

export function computeActionOutcome(
  series: UploadedDailyRevenuePoint[] | undefined,
  completedDate: string,
  windowDays: number = DEFAULT_WINDOW,
): ActionOutcome {
  const empty: ActionOutcome = {
    status: 'insufficient_data',
    completedDate,
    windowDays,
    beforeDays: 0,
    afterDays: 0,
    beforeAvgSales: 0,
    afterAvgSales: 0,
    salesDeltaPct: null,
    beforeAvgOrders: null,
    afterAvgOrders: null,
    orderDeltaPct: null,
    beforeAvgTicket: null,
    afterAvgTicket: null,
    ticketDeltaPct: null,
  };

  if (!Array.isArray(series) || series.length === 0) return empty;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return empty;

  const beforeStart = addDays(completedDate, -windowDays);
  const beforeEnd = addDays(completedDate, -1);
  const afterStart = completedDate;          // include the completion day
  const afterEnd = addDays(completedDate, windowDays - 1);

  const before = series.filter((p) => p.date >= beforeStart && p.date <= beforeEnd);
  const after = series.filter((p) => p.date >= afterStart && p.date <= afterEnd);

  const beforeSales = avg(before, (p) => Number(p.net_sales || 0));
  const afterSales = avg(after, (p) => Number(p.net_sales || 0));
  const beforeOrders = avg(before, (p) => Number(p.order_count || 0));
  const afterOrders = avg(after, (p) => Number(p.order_count || 0));

  const todayKey = todayIsoDate();
  const enoughAfter = after.length >= MIN_AFTER_DAYS;
  const enoughBefore = before.length >= MIN_BEFORE_DAYS;

  const salesDeltaPct = enoughAfter && enoughBefore ? pctDelta(beforeSales.avg, afterSales.avg) : null;

  let status: ActionOutcomeStatus;
  if (!enoughBefore) {
    status = 'insufficient_data';
  } else if (!enoughAfter) {
    // Still inside the observation window — show "observing" if today is
    // within windowDays of completion, otherwise insufficient_data.
    status = todayKey <= afterEnd ? 'observing' : 'insufficient_data';
  } else if (salesDeltaPct === null) {
    status = 'unknown';
  } else if (salesDeltaPct >= 3) {
    status = 'positive';
  } else if (salesDeltaPct <= -3) {
    status = 'negative';
  } else {
    status = 'neutral';
  }

  const beforeTicketAvg = beforeOrders.avg > 0 ? beforeSales.avg / beforeOrders.avg : null;
  const afterTicketAvg = afterOrders.avg > 0 ? afterSales.avg / afterOrders.avg : null;

  return {
    status,
    completedDate,
    windowDays,
    beforeDays: before.length,
    afterDays: after.length,
    beforeAvgSales: Math.round(beforeSales.avg),
    afterAvgSales: Math.round(afterSales.avg),
    salesDeltaPct,
    beforeAvgOrders: beforeOrders.count > 0 ? Math.round(beforeOrders.avg) : null,
    afterAvgOrders: afterOrders.count > 0 ? Math.round(afterOrders.avg) : null,
    orderDeltaPct: enoughBefore && enoughAfter ? pctDelta(beforeOrders.avg, afterOrders.avg) : null,
    beforeAvgTicket: beforeTicketAvg !== null ? Math.round(beforeTicketAvg) : null,
    afterAvgTicket: afterTicketAvg !== null ? Math.round(afterTicketAvg) : null,
    ticketDeltaPct: beforeTicketAvg !== null && afterTicketAvg !== null ? pctDelta(beforeTicketAvg, afterTicketAvg) : null,
  };
}

export function outcomeStatusLabel(status: ActionOutcomeStatus, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    if (status === 'observing') return '관찰 중';
    if (status === 'positive') return '긍정적 변화';
    if (status === 'negative') return '하락 관측';
    if (status === 'neutral') return '변화 불확실';
    if (status === 'insufficient_data') return '데이터 부족';
    return '추적 대기';
  }
  if (status === 'observing') return 'Observing';
  if (status === 'positive') return 'Lift observed';
  if (status === 'negative') return 'Drop observed';
  if (status === 'neutral') return 'Change unclear';
  if (status === 'insufficient_data') return 'Insufficient data';
  return 'Pending';
}

export function outcomeNote(status: ActionOutcomeStatus, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    if (status === 'observing') return '실행 후 7일 변화를 관찰 중입니다.';
    if (status === 'insufficient_data') return '아직 비교할 매출 데이터가 부족합니다.';
    if (status === 'positive' || status === 'negative' || status === 'neutral')
      return '실행 후 함께 관측된 변화입니다. 효과 확정이 아닙니다.';
    return '결과 추적 대기 중입니다.';
  }
  if (status === 'observing') return 'Observing the 7-day change after completion.';
  if (status === 'insufficient_data') return 'Not enough sales data yet to compare.';
  if (status === 'positive' || status === 'negative' || status === 'neutral')
    return 'This is the change observed after the action — not a proven effect.';
  return 'Outcome tracking pending.';
}
