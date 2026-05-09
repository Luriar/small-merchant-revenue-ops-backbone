// Frontend-derived V1.2 context collectors.
//
// The calendar collector is fully deterministic — it only reads the
// uploaded daily series (already loaded in the cockpit) and computes
// weekday/weekend/season/month-end heuristics. We label its source as
// "deterministic_calendar" so the UI never claims an official holiday API.
//
// The local-event collector is an honest "not_connected" placeholder
// while no event source is wired. When seeded events ever appear in
// scenario data we surface them, otherwise we render a transparent
// not-connected card.

import type {
  RcLang,
  Scenario,
  UploadedDailyRevenuePoint,
  ContextCollectorCard,
} from './revenueCockpitTypes';

const SEASON_LABELS_KO: Record<string, string> = {
  spring: '봄', summer: '여름', autumn: '가을', winter: '겨울',
};
const SEASON_LABELS_EN: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
};

function pickSeason(month: number): keyof typeof SEASON_LABELS_KO {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export interface CalendarContextSummary {
  status: 'ok' | 'partial' | 'not_connected';
  source_type: 'deterministic_calendar';
  period_start: string | null;
  period_end: string | null;
  weekday_days: number;
  weekend_days: number;
  weekend_share_pct: number;
  dominant_weekday: number | null;       // 0=Sunday … 6=Saturday
  season_label: keyof typeof SEASON_LABELS_KO | null;
  payday_proximity_days_count: number;   // sample dates within ±2 days of the 25th or month-end
  last_collected_at: string | null;
}

const PAYDAY_DAYS = new Set([23, 24, 25, 26, 27]);

export function buildCalendarContext(series: UploadedDailyRevenuePoint[] | undefined): CalendarContextSummary {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      status: 'not_connected',
      source_type: 'deterministic_calendar',
      period_start: null,
      period_end: null,
      weekday_days: 0,
      weekend_days: 0,
      weekend_share_pct: 0,
      dominant_weekday: null,
      season_label: null,
      payday_proximity_days_count: 0,
      last_collected_at: null,
    };
  }
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0].date;
  const end = sorted[sorted.length - 1].date;
  let weekend = 0;
  let weekday = 0;
  let payday = 0;
  const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const point of sorted) {
    const dow = dayOfWeek(point.date);
    dowCounts[dow] += 1;
    if (dow === 0 || dow === 6) weekend += 1; else weekday += 1;
    const dom = dayOfMonth(point.date);
    if (PAYDAY_DAYS.has(dom) || dom >= 28) payday += 1;
  }
  const totalDays = weekend + weekday;
  const dominantDow = dowCounts.indexOf(Math.max(...dowCounts));
  const midMonth = Number(end.slice(5, 7));

  return {
    status: totalDays > 0 ? 'ok' : 'partial',
    source_type: 'deterministic_calendar',
    period_start: start,
    period_end: end,
    weekday_days: weekday,
    weekend_days: weekend,
    weekend_share_pct: totalDays > 0 ? Math.round((weekend / totalDays) * 1000) / 10 : 0,
    dominant_weekday: dominantDow,
    season_label: pickSeason(midMonth),
    payday_proximity_days_count: payday,
    last_collected_at: end,
  };
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calendarSummaryLine(summary: CalendarContextSummary, lang: RcLang): string {
  if (summary.status === 'not_connected') {
    return lang === 'ko' ? '업로드 매출 데이터가 등록되면 자동 계산됩니다.' : 'Computed automatically once sales data is registered.';
  }
  const seasonKey = summary.season_label;
  const season = seasonKey ? (lang === 'ko' ? SEASON_LABELS_KO[seasonKey] : SEASON_LABELS_EN[seasonKey]) : '';
  const dom = summary.dominant_weekday !== null
    ? (lang === 'ko' ? WEEKDAY_KO[summary.dominant_weekday] : WEEKDAY_EN[summary.dominant_weekday])
    : '';
  if (lang === 'ko') {
    return `${season} · 주말 ${summary.weekend_share_pct.toFixed(1)}% · 우세 요일 ${dom}`;
  }
  return `${season} · weekend ${summary.weekend_share_pct.toFixed(1)}% · dominant ${dom}`;
}

export function calendarCollectorCard(summary: CalendarContextSummary, lang: RcLang): ContextCollectorCard {
  return {
    id: 'calendar_context',
    label: { ko: '공휴일/요일/시즌', en: 'Holiday / weekday / season' },
    status: summary.status,
    source_name: lang === 'ko' ? '계산된 캘린더 맥락' : 'Computed calendar context',
    last_collected_at: summary.last_collected_at,
    contributes_to: { ko: '요일·주말·시즌·급여일 근접 보정', en: 'Weekday/weekend/season/payday adjustment' },
    explanation: calendarSummaryLine(summary, lang),
  };
}

export interface LocalEventContext {
  status: 'ok' | 'partial' | 'not_connected' | 'planned';
  collector_name: 'local_event_context';
  source_name: string;
  source_type: 'manual_seed' | 'configured' | 'not_connected';
  last_updated_at: string | null;
  events: Array<{
    event_name: string;
    event_date: string;
    event_area: string | null;
    event_type: string | null;
  }>;
}

export function buildLocalEventContext(scenario: Scenario): LocalEventContext {
  // No live regional event API key wired yet — we surface seed/manual data
  // when the scenario provides it, otherwise show a transparent
  // not-connected status. Never invent events.
  const seeded = Array.isArray(scenario.localEvents) ? scenario.localEvents : [];
  if (seeded.length === 0) {
    return {
      status: 'not_connected',
      collector_name: 'local_event_context',
      source_name: '',
      source_type: 'not_connected',
      last_updated_at: null,
      events: [],
    };
  }
  const last = seeded
    .map((e) => e.event_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? null;
  return {
    status: seeded.length >= 2 ? 'ok' : 'partial',
    collector_name: 'local_event_context',
    source_name: 'manual_seed',
    source_type: 'manual_seed',
    last_updated_at: last,
    events: seeded.map((e) => ({
      event_name: e.event_name,
      event_date: e.event_date,
      event_area: e.event_area ?? null,
      event_type: e.event_type ?? null,
    })),
  };
}

export function localEventCollectorCard(local: LocalEventContext, lang: RcLang): ContextCollectorCard {
  if (local.status === 'not_connected') {
    return {
      id: 'local_event_context',
      label: { ko: '지역 이벤트', en: 'Local events' },
      status: 'not_connected',
      source_name: lang === 'ko' ? '미연결' : 'Not connected',
      last_collected_at: null,
      contributes_to: { ko: '지역 행사·인근 이벤트 맥락', en: 'Local event / nearby event context' },
      explanation: lang === 'ko'
        ? '지역 이벤트 데이터 소스가 아직 연결되지 않았습니다. 수동 등록 또는 연동 후에 표시됩니다.'
        : 'No local event source is connected yet. Will appear after manual registration or integration.',
    };
  }
  return {
    id: 'local_event_context',
    label: { ko: '지역 이벤트', en: 'Local events' },
    status: local.status,
    source_name: lang === 'ko' ? '수동 등록 지역 이벤트' : 'Manually registered local event',
    last_collected_at: local.last_updated_at,
    contributes_to: { ko: '지역 행사·인근 이벤트 맥락', en: 'Local event / nearby event context' },
    explanation: lang === 'ko'
      ? `등록된 이벤트 ${local.events.length}건 · 수동 등록 데이터입니다.`
      : `${local.events.length} registered events · manually registered data.`,
  };
}

export function statusLabel(status: ContextCollectorCard['status'], lang: RcLang): string {
  if (lang === 'ko') {
    if (status === 'ok') return '정상';
    if (status === 'partial') return '일부 누락';
    if (status === 'failed') return '실패';
    if (status === 'skipped') return '건너뜀';
    if (status === 'planned') return '준비 중';
    return '미연결';
  }
  if (status === 'ok') return 'Healthy';
  if (status === 'partial') return 'Partial';
  if (status === 'failed') return 'Failed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'planned') return 'Planned';
  return 'Not connected';
}

export function statusTone(status: ContextCollectorCard['status']): 'good' | 'bad' | 'warm' | 'neutral' | 'quiet' {
  if (status === 'ok') return 'good';
  if (status === 'failed') return 'bad';
  if (status === 'partial') return 'warm';
  if (status === 'planned') return 'neutral';
  return 'quiet';
}
