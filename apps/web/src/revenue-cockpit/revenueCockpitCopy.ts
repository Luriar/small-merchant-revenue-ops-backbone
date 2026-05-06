import type { Scenario, ActionStatuses } from './revenueCockpitTypes';

export const SCENARIO: Scenario = {
  area: { ko: '성수', en: 'Seongsu' },
  category: { ko: '카페·커피음료', en: 'Coffee & Drinks' },
  base: { ko: '2024년 3분기', en: '2024 Q3' },
  compare: { ko: '2024년 4분기', en: '2024 Q4' },
  revenueChange: -12.0,
  txnChange: -10.2,
  ticketChange: -1.9,
  populationChange: -8.4,
  competitorChange: +6.1,
  rainyDayChange: +28.0,

  revSeries: [
    { label: '23Q1', v: 92.4 },
    { label: '23Q2', v: 96.1 },
    { label: '23Q3', v: 99.0 },
    { label: '23Q4', v: 95.2 },
    { label: '24Q1', v: 97.6 },
    { label: '24Q2', v: 101.3 },
    { label: '24Q3', v: 100.0 },
    { label: '24Q4', v: 88.0 },
  ],

  causes: [
    {
      id: 'demand',
      icon: 'demand',
      strength: 'strong',
      delta: -8.4,
      title: { ko: '생활인구 감소', en: 'Foot traffic softened' },
      headline: {
        ko: '평일 점심·저녁 시간대 생활인구가 함께 감소했습니다.',
        en: 'Weekday lunch and evening foot traffic dropped alongside revenue.',
      },
      body: {
        ko: '성수 상권의 분기 평균 생활인구가 8.4% 감소했고, 같은 기간 거래건수도 10.2% 감소했습니다. 두 신호가 함께 관측되어 수요 측 요인이 영향을 주었을 가능성이 있습니다.',
        en: 'Quarterly mean foot traffic in the Seongsu area fell 8.4% while transaction count fell 10.2%. The two signals moved together, suggesting demand-side factors may have contributed.',
      },
      sources: ['생활인구 (SKT)', 'revenue_signal'],
    },
    {
      id: 'weather',
      icon: 'weather',
      strength: 'strong',
      delta: +28.0,
      title: { ko: '강수일수 증가', en: 'More rainy days' },
      headline: {
        ko: '비 온 날이 전 분기 대비 28% 늘었습니다.',
        en: 'Rainy days rose 28% versus last quarter.',
      },
      body: {
        ko: '기상청 ASOS 기준 강수일수가 14일에서 18일로 증가했습니다. 비 오는 날 외부 음료 매장 방문이 줄어드는 경향이 알려져 있어, 매출 변화에 영향을 주었을 가능성이 있습니다.',
        en: 'KMA ASOS recorded 18 rainy days vs. 14 in the prior quarter. Customers tend to skip outside coffee runs in rain, which may have contributed to the change.',
      },
      sources: ['KMA ASOS · Seoul'],
    },
    {
      id: 'competition',
      icon: 'competition',
      strength: 'medium',
      delta: +6.1,
      title: { ko: '동종 점포수 증가', en: 'More nearby competitors' },
      headline: {
        ko: '인근 카페 점포수가 6.1% 늘었습니다.',
        en: 'Nearby café count grew 6.1%.',
      },
      body: {
        ko: '성수 상권 내 카페·커피음료 점포 수가 인허가 기준으로 6.1% 증가했습니다. 단골 분산 가능성이 있어 추가 확인이 필요합니다.',
        en: 'Permitted café/drinks venues in the Seongsu trade area rose 6.1%. Regulars may be splitting across more options — needs further confirmation.',
      },
      sources: ['업종별 인허가'],
    },
    {
      id: 'context',
      icon: 'context',
      strength: 'weak',
      delta: -1,
      title: { ko: '4분기 공휴일 1일 감소', en: 'One fewer holiday in Q4' },
      headline: {
        ko: '비교 기간의 공휴일 수가 1일 줄었습니다.',
        en: 'Q4 had one fewer public holiday than Q3.',
      },
      body: {
        ko: '공휴일 수가 1일 감소한 것은 단독 영향력이 크지 않지만 다른 요인과 결합 시 영향을 줄 수 있습니다. 데이터가 충분하지 않아 추가 확인이 필요합니다.',
        en: 'A single-day holiday delta is small on its own but can compound with other factors. Data is limited — needs further confirmation.',
      },
      sources: ['holiday_context'],
    },
  ],

  actions: [
    {
      id: 'rain-coupon',
      effort: 'low', impact: 'medium', timeframe: 'this-week',
      type: 'promotion',
      title: { ko: '우천 시 발송하는 빗방울 쿠폰', en: 'Rainy-day "drizzle" coupon' },
      summary: {
        ko: '비 예보가 있는 날 단골 손님에게 자동으로 -15% 쿠폰을 보냅니다.',
        en: 'Auto-send a -15% coupon to regulars when rain is forecast.',
      },
      tied: ['weather', 'demand'],
      steps: [
        { ko: 'SmartPlace 단골 리스트 추출', en: 'Export regulars from SmartPlace' },
        { ko: '쿠폰 템플릿 등록', en: 'Save coupon template' },
        { ko: '강수 확률 70% 이상일 때 자동 발송', en: 'Trigger on >70% rain probability' },
      ],
    },
    {
      id: 'stamp-card',
      effort: 'low', impact: 'high', timeframe: 'this-week',
      type: 'customer_retention',
      title: { ko: '단골 스탬프 카드 도입', en: 'Launch a regulars stamp card' },
      summary: {
        ko: '주 2회 이상 방문 고객을 잡아두기 위한 10잔 = 1잔 무료 스탬프.',
        en: 'A simple 10-for-1 punch card to lock in 2x/week visitors.',
      },
      tied: ['competition', 'demand'],
      steps: [
        { ko: '스탬프 디자인 1시간', en: 'Design stamp card · 1h' },
        { ko: '카운터 비치 카드 100장 인쇄', en: 'Print 100 cards' },
        { ko: '직원 안내 스크립트 공유', en: 'Share staff script' },
      ],
    },
    {
      id: 'delivery-push',
      effort: 'medium', impact: 'medium', timeframe: 'this-week',
      type: 'channel',
      title: { ko: '배달앱 우천 노출 강화', en: 'Boost delivery visibility on rainy days' },
      summary: {
        ko: '배민·쿠팡이츠에 우천 키워드 광고를 일 ₩5,000 한도로 운영합니다.',
        en: 'Run rain-keyword ads on Baemin/Coupang Eats, capped at ₩5k/day.',
      },
      tied: ['weather'],
      steps: [
        { ko: '배민 광고 키워드 등록', en: 'Add Baemin keywords' },
        { ko: '쿠팡이츠 동일 작업', en: 'Repeat on Coupang Eats' },
        { ko: '우천 예보 발생 시 자동 활성', en: 'Auto-enable when rain forecast hits' },
      ],
    },
    {
      id: 'winter-set',
      effort: 'medium', impact: 'medium', timeframe: 'next-2-weeks',
      type: 'menu_update',
      title: { ko: '겨울 시즌 따뜻한 세트 메뉴', en: 'Warm winter set menu' },
      summary: {
        ko: '핫 라떼 + 베이커리 세트로 객단가를 ₩1,500 끌어올립니다.',
        en: 'Hot latte + bakery set to lift ticket size by ~₩1,500.',
      },
      tied: ['demand', 'competition'],
      steps: [
        { ko: '세트 가격 책정', en: 'Price the set' },
        { ko: 'POS·메뉴판 등록', en: 'Add to POS & menu' },
        { ko: '인스타 공지', en: 'Announce on Instagram' },
      ],
    },
    {
      id: 'instagram',
      effort: 'low', impact: 'low', timeframe: 'this-week',
      type: 'communication',
      title: { ko: '주 2회 인스타 릴스', en: 'Post Instagram Reels twice a week' },
      summary: {
        ko: '신메뉴와 분위기 영상으로 자연 노출을 늘립니다.',
        en: 'Lightweight Reels of new drinks and store mood — organic reach.',
      },
      tied: ['competition'],
      steps: [
        { ko: '월·목 오전 촬영', en: 'Shoot Mon/Thu morning' },
        { ko: '15초 컷 편집', en: 'Edit 15-sec cut' },
        { ko: '단골 태그', en: 'Tag regulars' },
      ],
    },
    {
      id: 'staff-rebalance',
      effort: 'high', impact: 'medium', timeframe: 'next-month',
      type: 'cost_management',
      title: { ko: '비수기 인력 시간대 재조정', en: 'Rebalance staff hours for the slow quarter' },
      summary: {
        ko: '오후 3–5시 인력을 1명에서 0.5명으로 조정해 변동비를 줄입니다.',
        en: 'Trim 3–5pm staffing from 1 → 0.5 to cut variable cost.',
      },
      tied: ['demand'],
      steps: [
        { ko: '시간대별 매출 검토', en: 'Review hourly revenue' },
        { ko: '직원 협의', en: 'Talk to staff' },
        { ko: '12월 셋째 주부터 적용', en: 'Apply from Dec week 3' },
      ],
    },
  ],

  reliability: {
    overall: 'healthy',
    sources: [
      { id: 'rev',  name: { ko: '서울 추정매출',   en: 'Seoul Estimated Revenue' },  freshness: '2025-01-14', cadence: { ko: '분기',     en: 'Quarterly' },         status: 'ok',      coverage: 100 },
      { id: 'pop',  name: { ko: '생활인구',         en: 'Floating Population' },       freshness: '2025-01-12', cadence: { ko: '월별',     en: 'Monthly' },           status: 'ok',      coverage: 100 },
      { id: 'wx',   name: { ko: '기상청 ASOS',      en: 'KMA ASOS Weather' },          freshness: '2025-01-13', cadence: { ko: '일별',     en: 'Daily' },             status: 'ok',      coverage: 100 },
      { id: 'comp', name: { ko: '업종별 점포수',    en: 'Permitted Store Count' },     freshness: '2025-01-08', cadence: { ko: '월별',     en: 'Monthly' },           status: 'partial', coverage: 92  },
      { id: 'hol',  name: { ko: '공휴일·행사',      en: 'Holidays & Events' },         freshness: '2025-01-01', cadence: { ko: '연간·실시간', en: 'Annual + live' },  status: 'ok',      coverage: 100 },
    ],
    runs: 14, failures: 0, lastRun: { ko: '오늘 06:14', en: 'Today 06:14' },
  },
};

export const T = {
  appName:         { ko: 'Revenue Brief',        en: 'Revenue Brief' },
  brand:           { ko: 'Revenue OS',            en: 'Revenue OS' },
  navBrief:        { ko: '매출 브리프',           en: 'Revenue Brief' },
  navEvidence:     { ko: '근거 보기',             en: 'Cause Evidence' },
  navActions:      { ko: '액션 플래너',           en: 'Action Planner' },
  navReliability:  { ko: '데이터 신뢰도',         en: 'Data Reliability' },

  whatHappened:    { ko: '무슨 일이 있었나',      en: 'What happened' },
  whyMaybe:        { ko: '왜 그랬을지',           en: 'Why it may have happened' },
  thisWeek:        { ko: '이번 주에 시도해볼 것', en: 'What to try this week' },
  trust:           { ko: '데이터 신뢰도',         en: 'Can I trust the data' },

  baselineLabel:   { ko: '기준',                  en: 'Baseline' },
  compareLabel:    { ko: '비교',                  en: 'Compare' },
  vsBaseline:      { ko: '기준 분기 대비',        en: 'vs. baseline' },
  estimatedNote:   { ko: '공공데이터 기반 추정치 · 상권/업종 단위', en: 'Public-data estimates · trade-area level' },

  causeLabel:      { ko: '가능성 높은 원인 후보', en: 'Likely cause candidates' },
  observedTogether:{ ko: '함께 관측됨',           en: 'Observed together' },
  needsConfirm:    { ko: '추가 확인이 필요합니다',en: 'Needs further confirmation' },
  mayHaveContrib:  { ko: '영향을 주었을 가능성',  en: 'May have contributed' },

  strength_strong: { ko: '신호 강함',             en: 'Strong signal' },
  strength_medium: { ko: '신호 보통',             en: 'Medium signal' },
  strength_weak:   { ko: '신호 약함',             en: 'Weak signal' },

  effort_low:      { ko: '간단',                  en: 'Low effort' },
  effort_medium:   { ko: '중간',                  en: 'Medium effort' },
  effort_high:     { ko: '큰 작업',              en: 'High effort' },
  impact_low:      { ko: '작은 효과',             en: 'Small impact' },
  impact_medium:   { ko: '중간 효과',             en: 'Medium impact' },
  impact_high:     { ko: '큰 효과',              en: 'High impact' },

  thisWeekTag:     { ko: '이번 주',               en: 'This week' },
  next2:           { ko: '2주 내',                en: 'Next 2 wks' },
  nextMonth:       { ko: '다음 달',               en: 'Next month' },

  startAction:     { ko: '시작하기',              en: 'Start' },
  saveForLater:    { ko: '나중에 보기',           en: 'Save for later' },
  seeEvidence:     { ko: '근거 보기',             en: 'See evidence' },
  seeAllActions:   { ko: '추천 3개 모두 보기',   en: 'See all 3 actions' },
  openBrief:       { ko: '브리프 열기',           en: 'Open brief' },
  whyMatters:      { ko: '왜 중요한가요',         en: 'Why this matters' },
  howWeKnow:       { ko: '어떻게 알게 됐나요',   en: 'How we know' },

  pipelineHealthy: { ko: '파이프라인 상태 양호',  en: 'Pipeline healthy' },
  freshAsOf:       { ko: '갱신',                  en: 'Fresh as of' },
  cadence:         { ko: '갱신 주기',             en: 'Cadence' },
  coverage:        { ko: '커버리지',              en: 'Coverage' },
  runs14:          { ko: '최근 14회 실행 · 실패 0', en: 'Last 14 runs · 0 failures' },

  disclaimer: {
    ko: '본 시스템은 가능성 높은 원인 후보를 근거와 함께 제시합니다. 인과관계를 확정하거나 매출 회복을 보장하지 않습니다.',
    en: 'This system surfaces likely cause candidates with supporting evidence. It does not prove causation or guarantee revenue recovery.',
  },
} as const;

export type TKey = keyof typeof T;

export function tr(key: TKey, lang: 'ko' | 'en'): string {
  const entry = T[key] as { ko: string; en: string };
  return entry[lang] ?? entry.en ?? key;
}

export const fmtPct = (n: number, sign = true): string =>
  `${sign && n > 0 ? '+' : ''}${n.toFixed(1)}%`;

export const DEFAULT_STATUSES: ActionStatuses = {
  'rain-coupon':    'selected',
  'stamp-card':     'planned',
  'delivery-push':  'recommended',
  'winter-set':     'recommended',
  'instagram':      'done',
  'staff-rebalance':'dismissed',
};
