// shared.jsx — scenario data, copy (KO/EN), shared atoms

// ─────────────────────────────────────────────────────────────────────
// Scenario: Seongsu coffee/drinks, 2024 Q4 vs Q3
// ─────────────────────────────────────────────────────────────────────
const SCENARIO = {
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

  // Quarterly revenue index, normalized to Q3 = 100. (8 quarters)
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

  // Cause candidates — order matters; first three are the "top" set.
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

  // 6 recommended actions
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
      { id: 'rev', name: { ko: '서울 추정매출', en: 'Seoul Estimated Revenue' }, freshness: '2025-01-14', cadence: { ko: '분기', en: 'Quarterly' }, status: 'ok', coverage: 100 },
      { id: 'pop', name: { ko: '생활인구', en: 'Floating Population' }, freshness: '2025-01-12', cadence: { ko: '월별', en: 'Monthly' }, status: 'ok', coverage: 100 },
      { id: 'wx',  name: { ko: '기상청 ASOS', en: 'KMA ASOS Weather' }, freshness: '2025-01-13', cadence: { ko: '일별', en: 'Daily' }, status: 'ok', coverage: 100 },
      { id: 'comp',name: { ko: '업종별 점포수', en: 'Permitted Store Count' }, freshness: '2025-01-08', cadence: { ko: '월별', en: 'Monthly' }, status: 'partial', coverage: 92 },
      { id: 'hol', name: { ko: '공휴일·행사', en: 'Holidays & Events' }, freshness: '2025-01-01', cadence: { ko: '연간·실시간', en: 'Annual + live' }, status: 'ok', coverage: 100 },
    ],
    runs: 14, failures: 0, lastRun: { ko: '오늘 06:14', en: 'Today 06:14' },
  },
};

// ─────────────────────────────────────────────────────────────────────
// i18n — global UI strings
// ─────────────────────────────────────────────────────────────────────
const T = {
  appName:        { ko: 'Revenue Brief', en: 'Revenue Brief' },
  brand:          { ko: 'Revenue OS', en: 'Revenue OS' },
  navBrief:       { ko: '매출 브리프', en: 'Revenue Brief' },
  navEvidence:    { ko: '근거 보기', en: 'Cause Evidence' },
  navActions:     { ko: '액션 플래너', en: 'Action Planner' },
  navReliability: { ko: '데이터 신뢰도', en: 'Data Reliability' },

  whatHappened:   { ko: '무슨 일이 있었나', en: 'What happened' },
  whyMaybe:       { ko: '왜 그랬을지', en: 'Why it may have happened' },
  thisWeek:       { ko: '이번 주에 시도해볼 것', en: 'What to try this week' },
  trust:          { ko: '데이터 신뢰도', en: 'Can I trust the data' },

  baselineLabel:  { ko: '기준', en: 'Baseline' },
  compareLabel:   { ko: '비교', en: 'Compare' },
  vsBaseline:     { ko: '기준 분기 대비', en: 'vs. baseline' },
  estimatedNote:  { ko: '공공데이터 기반 추정치 · 상권/업종 단위', en: 'Public-data estimates · trade-area level' },

  causeLabel:     { ko: '가능성 높은 원인 후보', en: 'Likely cause candidates' },
  observedTogether:{ko: '함께 관측됨', en: 'Observed together' },
  needsConfirm:   { ko: '추가 확인이 필요합니다', en: 'Needs further confirmation' },
  mayHaveContrib: { ko: '영향을 주었을 가능성', en: 'May have contributed' },

  strength_strong:{ ko: '신호 강함', en: 'Strong signal' },
  strength_medium:{ ko: '신호 보통', en: 'Medium signal' },
  strength_weak:  { ko: '신호 약함', en: 'Weak signal' },

  effort_low:     { ko: '간단', en: 'Low effort' },
  effort_medium:  { ko: '중간', en: 'Medium effort' },
  effort_high:    { ko: '큰 작업', en: 'High effort' },
  impact_low:     { ko: '작은 효과', en: 'Small impact' },
  impact_medium:  { ko: '중간 효과', en: 'Medium impact' },
  impact_high:    { ko: '큰 효과', en: 'High impact' },

  thisWeekTag:    { ko: '이번 주', en: 'This week' },
  next2:          { ko: '2주 내', en: 'Next 2 wks' },
  nextMonth:      { ko: '다음 달', en: 'Next month' },

  startAction:    { ko: '시작하기', en: 'Start' },
  saveForLater:   { ko: '나중에 보기', en: 'Save for later' },
  seeEvidence:    { ko: '근거 보기', en: 'See evidence' },
  seeAllActions:  { ko: '추천 6개 모두 보기', en: 'See all 6 actions' },
  openBrief:      { ko: '브리프 열기', en: 'Open brief' },
  whyMatters:     { ko: '왜 중요한가요', en: 'Why this matters' },
  howWeKnow:      { ko: '어떻게 알게 됐나요', en: 'How we know' },

  pipelineHealthy:{ ko: '파이프라인 상태 양호', en: 'Pipeline healthy' },
  freshAsOf:      { ko: '갱신', en: 'Fresh as of' },
  cadence:        { ko: '갱신 주기', en: 'Cadence' },
  coverage:       { ko: '커버리지', en: 'Coverage' },
  runs14:         { ko: '최근 14회 실행 · 실패 0', en: 'Last 14 runs · 0 failures' },

  disclaimer: {
    ko: '본 시스템은 가능성 높은 원인 후보를 근거와 함께 제시합니다. 인과관계를 확정하거나 매출 회복을 보장하지 않습니다.',
    en: 'This system surfaces likely cause candidates with supporting evidence. It does not prove causation or guarantee revenue recovery.',
  },
};
const tr = (k, lang) => (T[k] && T[k][lang]) || (T[k] && T[k].en) || k;

// ─────────────────────────────────────────────────────────────────────
// Tiny SVG atoms (icons + sparkline)
// ─────────────────────────────────────────────────────────────────────
function Sparkline({ points, width = 220, height = 56, dropFrom = null, color = 'currentColor', fade = 'rgba(0,0,0,0.06)' }) {
  if (!points || !points.length) return null;
  const min = Math.min(...points.map(p => p.v));
  const max = Math.max(...points.map(p => p.v));
  const pad = 6;
  const range = Math.max(1, max - min);
  const xs = points.map((p, i) => pad + (i * (width - pad * 2)) / (points.length - 1));
  const ys = points.map(p => height - pad - ((p.v - min) / range) * (height - pad * 2));
  const d = points.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {/* baseline grid */}
      <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} stroke={fade} strokeDasharray="2 4" />
      <path d={`${d} L ${xs[last]} ${height - pad} L ${xs[0]} ${height - pad} Z`} fill={fade} opacity="0.7" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {dropFrom !== null && (
        <line x1={xs[dropFrom]} x2={xs[last]} y1={ys[dropFrom]} y2={ys[last]} stroke={color} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.55" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r={i === last ? 3 : 1.6} fill={i === last ? color : 'currentColor'} opacity={i === last ? 1 : 0.45} />
      ))}
    </svg>
  );
}

// Minimalist line icons (1.5px stroke). Always currentColor.
function Icon({ name, size = 16 }) {
  const s = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'demand':      return (<svg viewBox="0 0 24 24" {...s}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="6" r="2"/><path d="M14 13c1-1 2-1.5 3-1.5"/></svg>);
    case 'weather':     return (<svg viewBox="0 0 24 24" {...s}><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-1 6.9"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></svg>);
    case 'competition': return (<svg viewBox="0 0 24 24" {...s}><rect x="3" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="13" width="4" height="7"/></svg>);
    case 'context':     return (<svg viewBox="0 0 24 24" {...s}><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>);
    case 'arrow-down':  return (<svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M6 13l6 6 6-6"/></svg>);
    case 'arrow-up':    return (<svg viewBox="0 0 24 24" {...s}><path d="M12 19V5M6 11l6-6 6 6"/></svg>);
    case 'spark':       return (<svg viewBox="0 0 24 24" {...s}><path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2 2 .7-2 .7-.8 2-.8-2-2-.7 2-.7z"/></svg>);
    case 'check':       return (<svg viewBox="0 0 24 24" {...s}><path d="M5 12.5l4 4 10-10"/></svg>);
    case 'plus':        return (<svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14"/></svg>);
    case 'sun':         return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>);
    case 'moon':        return (<svg viewBox="0 0 24 24" {...s}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>);
    case 'auto':        return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>);
    case 'globe':       return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>);
    case 'shield':      return (<svg viewBox="0 0 24 24" {...s}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>);
    case 'doc':         return (<svg viewBox="0 0 24 24" {...s}><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h7M10 17h5"/></svg>);
    case 'spark2':      return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M6.3 17.7l2-2M15.7 8.3l2-2"/></svg>);
    case 'flag':        return (<svg viewBox="0 0 24 24" {...s}><path d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>);
    case 'arrow-right': return (<svg viewBox="0 0 24 24" {...s}><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
    case 'dot':         return (<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>);
    default: return null;
  }
}

// Pill for tags
function Pill({ children, tone = 'neutral', size = 'md' }) {
  const tones = {
    neutral: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)', bd: 'var(--chip-bd)' },
    warm:    { bg: 'var(--accent-soft)', fg: 'var(--accent-strong)', bd: 'var(--accent-soft-bd)' },
    good:    { bg: 'var(--good-soft)', fg: 'var(--good-strong)', bd: 'var(--good-soft-bd)' },
    bad:     { bg: 'var(--bad-soft)', fg: 'var(--bad-strong)', bd: 'var(--bad-soft-bd)' },
    quiet:   { bg: 'transparent', fg: 'var(--fg-muted)', bd: 'var(--rule)' },
  };
  const t = tones[tone] || tones.neutral;
  const pad = size === 'sm' ? '2px 7px' : '3px 10px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: pad, fontSize: fs, lineHeight: 1.2,
      borderRadius: 999, background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`, fontWeight: 500, letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Strength dots (1–3)
function StrengthDots({ level }) {
  const n = level === 'strong' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i < n ? 'currentColor' : 'transparent',
          border: '1px solid currentColor',
          opacity: i < n ? 1 : 0.35,
        }}/>
      ))}
    </span>
  );
}

// Format helpers
const fmtPct = (n, sign = true) => `${sign && n > 0 ? '+' : ''}${n.toFixed(1)}%`;

// Chrome bar (theme + lang) used by every direction's container
function ChromeBar({ lang, setLang, theme, setTheme, label }) {
  const Btn = ({ active, onClick, title, children }) => (
    <button onClick={onClick} title={title} style={{
      all: 'unset', cursor: 'pointer', padding: '6px 8px', borderRadius: 6,
      display: 'inline-flex', alignItems: 'center', gap: 4,
      color: active ? 'var(--fg)' : 'var(--fg-muted)',
      background: active ? 'var(--surface-2)' : 'transparent',
      fontSize: 12, fontWeight: 500,
    }}>{children}</button>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderBottom: '1px solid var(--rule)',
      background: 'var(--surface-1)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 'auto' }}>
        {label}
      </span>
      <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 8, padding: 2, background: 'var(--surface-0)' }}>
        <Btn active={lang === 'ko'} onClick={() => setLang('ko')}>KO</Btn>
        <Btn active={lang === 'en'} onClick={() => setLang('en')}>EN</Btn>
      </div>
      <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 8, padding: 2, background: 'var(--surface-0)' }}>
        <Btn active={theme === 'light'}  onClick={() => setTheme('light')}  title="Light"><Icon name="sun" size={14}/></Btn>
        <Btn active={theme === 'dark'}   onClick={() => setTheme('dark')}   title="Dark"><Icon name="moon" size={14}/></Btn>
        <Btn active={theme === 'system'} onClick={() => setTheme('system')} title="System"><Icon name="auto" size={14}/></Btn>
      </div>
    </div>
  );
}

Object.assign(window, { SCENARIO, T, tr, Sparkline, Icon, Pill, StrengthDots, fmtPct, ChromeBar });
