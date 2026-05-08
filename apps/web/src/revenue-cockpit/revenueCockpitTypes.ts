export type RcLang = 'ko' | 'en';
export type RcTheme = 'light' | 'dark' | 'system';
export type RcScreen = 'brief' | 'evidence' | 'actions' | 'reliability';
export type ActionStatus = 'recommended' | 'selected' | 'planned' | 'done' | 'dismissed';
export type SignalStrength = 'strong' | 'medium' | 'weak';

export interface BiLingual {
  ko: string;
  en: string;
}

export interface RevSeries {
  label: string;
  v: number;
}

export interface CauseCandidate {
  id: string;
  icon: string;
  strength: SignalStrength;
  delta: number;
  title: BiLingual;
  headline: BiLingual;
  body: BiLingual;
  sources: string[];
}

export interface ActionStep {
  ko: string;
  en: string;
}

export interface RcAction {
  id: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  timeframe: 'this-week' | 'next-2-weeks' | 'next-month';
  type: string;
  title: BiLingual;
  summary: BiLingual;
  tied: string[];
  steps: ActionStep[];
}

export interface DataSource {
  id: string;
  name: BiLingual;
  sourceName?: string;
  freshness: string;
  cadence: BiLingual;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  coverage: number;
  durationMs?: number | null;
  reason?: string | null;
}

export interface ReliabilityInfo {
  overall: string;
  sources: DataSource[];
  runs: number;
  failures: number;
  lastRun: BiLingual;
}

export interface UploadedDailyRevenuePoint {
  date: string;
  net_sales: number;
  order_count?: number;
}

export interface Scenario {
  area: BiLingual;
  category: BiLingual;
  base: BiLingual;
  compare: BiLingual;
  revenueChange: number;
  txnChange: number;
  ticketChange: number;
  populationChange: number;
  competitorChange: number;
  rainyDayChange: number;
  revSeries: RevSeries[];
  causes: CauseCandidate[];
  actions: RcAction[];
  reliability: ReliabilityInfo;
  hasRevenueData?: boolean;
  isDemo?: boolean;
  storeName?: string;
  uploadedDailySeries?: UploadedDailyRevenuePoint[];
  insufficientData?: boolean;
  periodLabel?: string;
}

export type ActionStatuses = Record<string, ActionStatus>;
