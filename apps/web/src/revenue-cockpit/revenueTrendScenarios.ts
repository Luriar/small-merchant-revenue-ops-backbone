// Trend-aware copy + demo scenario alternates for Revenue OS.
// Production data is rendered through revenueCockpitData.ts; this module only
// supplies trend semantics and a positive demo scenario so the product
// surfaces a usable up/flat experience in addition to the existing decline.

import type { CauseCandidate, RcAction, Scenario } from './revenueCockpitTypes';

export type RevenueTrend = 'up' | 'down' | 'flat';

export const REVENUE_FLAT_THRESHOLD = 1.5; // |%| treated as flat

export function resolveTrend(scenario: Scenario): RevenueTrend {
  const change = scenario.revenueChange;
  if (Math.abs(change) <= REVENUE_FLAT_THRESHOLD) return 'flat';
  return change > 0 ? 'up' : 'down';
}

export function trendCopy(lang: 'ko' | 'en') {
  if (lang === 'ko') {
    return {
      down: {
        verb: '줄었습니다',
        observed: '거래건수 감소와 함께 관측되었습니다',
        actionsLead: '회복·진단·방어 액션',
        eyebrow: '이번 분기 매출 브리프 · 하락 신호',
        focus: '회복 가설 점검',
      },
      up: {
        verb: '늘었습니다',
        observed: '거래건수 증가와 함께 관측되었습니다',
        actionsLead: '유지·확대·검증 액션',
        eyebrow: '이번 분기 매출 브리프 · 상승 신호',
        focus: '상승 요인 검증과 유지',
      },
      flat: {
        verb: '큰 변화가 없습니다',
        observed: '거래건수와 객단가가 모두 안정적으로 관측되었습니다',
        actionsLead: '관찰 유지 · 작은 실험',
        eyebrow: '이번 분기 매출 브리프 · 관찰 구간',
        focus: '소규모 실험으로 신호 확인',
      },
    } as const;
  }
  return {
    down: {
      verb: 'fell',
      observed: 'observed alongside a drop in transaction count',
      actionsLead: 'Recovery · diagnosis · defense actions',
      eyebrow: 'This quarter — Revenue Brief · downward signal',
      focus: 'Validate recovery hypotheses',
    },
    up: {
      verb: 'rose',
      observed: 'observed alongside a rise in transaction count',
      actionsLead: 'Maintain · amplify · validate actions',
      eyebrow: 'This quarter — Revenue Brief · upward signal',
      focus: 'Validate and lock in the uplift',
    },
    flat: {
      verb: 'stayed roughly flat',
      observed: 'transactions and ticket size both stayed stable',
      actionsLead: 'Monitor · run small experiments',
      eyebrow: 'This quarter — Revenue Brief · steady',
      focus: 'Run small experiments to surface signals',
    },
  } as const;
}

const UPSIDE_CAUSES: CauseCandidate[] = [
  {
    id: 'demand-up',
    icon: 'demand',
    strength: 'strong',
    delta: +6.2,
    title: { ko: '생활인구 증가', en: 'Foot traffic rose' },
    headline: {
      ko: '평일 점심·저녁 시간대 생활인구가 함께 증가했습니다.',
      en: 'Weekday lunch and evening foot traffic rose alongside revenue.',
    },
    body: {
      ko: '성수 상권의 분기 평균 생활인구가 6.2% 증가했고, 같은 기간 거래건수도 9.1% 증가했습니다. 두 신호가 함께 관측되어 수요 측 요인이 매출 상승에 기여했을 가능성이 있습니다.',
      en: 'Quarterly mean foot traffic in Seongsu rose 6.2% while transaction count rose 9.1%. The two signals moved together, suggesting demand-side factors may have contributed to the uplift.',
    },
    sources: ['생활인구 (SKT)', 'revenue_signal'],
  },
  {
    id: 'weather-up',
    icon: 'weather',
    strength: 'medium',
    delta: -32.0,
    title: { ko: '강수일수 감소 · 날씨 개선', en: 'Fewer rainy days' },
    headline: {
      ko: '비 온 날이 전 분기 대비 32% 줄었습니다.',
      en: 'Rainy days fell 32% versus last quarter.',
    },
    body: {
      ko: '기상청 ASOS 기준 강수일수가 18일에서 12일로 감소했습니다. 맑은 날이 늘면서 외부 음료 매장 방문이 증가하는 경향이 있어, 매출 상승에 기여했을 가능성이 있습니다.',
      en: 'KMA ASOS recorded 12 rainy days vs. 18 in the prior quarter. Clearer weather tends to lift outside coffee runs, which may have contributed to the rise.',
    },
    sources: ['KMA ASOS · Seoul'],
  },
  {
    id: 'ticket-up',
    icon: 'spark',
    strength: 'medium',
    delta: +4.7,
    title: { ko: '객단가 상승', en: 'Ticket size rose' },
    headline: {
      ko: '시즌 세트 메뉴 도입 후 객단가가 함께 상승했습니다.',
      en: 'Ticket size rose after the seasonal set menu launch.',
    },
    body: {
      ko: '평균 객단가가 4.7% 상승했고, 세트 메뉴 비중이 증가했습니다. 동일 거래건수 대비 매출이 함께 늘어 메뉴 믹스 변화의 가능성 높은 신호입니다. 추가 확인이 필요합니다.',
      en: 'Average ticket size rose 4.7% as set-menu share grew. Revenue per transaction trended up — a likely menu-mix signal. Needs further confirmation.',
    },
    sources: ['POS · 메뉴 믹스'],
  },
  {
    id: 'competition-down',
    icon: 'competition',
    strength: 'weak',
    delta: -3.2,
    title: { ko: '인근 점포수 감소', en: 'Fewer nearby competitors' },
    headline: {
      ko: '성수 상권 내 카페·음료 점포 수가 3.2% 줄었습니다.',
      en: 'Nearby café/drinks venues fell 3.2%.',
    },
    body: {
      ko: '인허가 기준 카페·음료 점포 수가 3.2% 감소했습니다. 단골 집중도가 일시적으로 높아졌을 가능성이 있어 추가 확인이 필요합니다.',
      en: 'Permitted café/drinks venues fell 3.2%. Regulars may be concentrating temporarily — needs further confirmation.',
    },
    sources: ['업종별 인허가'],
  },
];

const UPSIDE_ACTIONS: RcAction[] = [
  {
    id: 'maintain-set',
    effort: 'low', impact: 'high', timeframe: 'this-week',
    type: 'menu_amplify',
    title: { ko: '잘 팔리는 세트 메뉴 노출 유지', en: 'Keep the winning set menu featured' },
    summary: {
      ko: '함께 관측된 객단가 상승의 주요 신호인 세트 메뉴를 POS·메뉴판 상단에 유지합니다.',
      en: 'Pin the set menu — the main signal observed alongside the ticket-size lift — to the top of the POS and menu.',
    },
    tied: ['ticket-up', 'demand-up'],
    steps: [
      { ko: 'POS 추천 슬롯 상단 고정', en: 'Pin to POS recommendation slot' },
      { ko: '메뉴판 1면 노출 유지', en: 'Keep on menu page 1' },
      { ko: '주간 단위로 매출 비중 확인', en: 'Review weekly revenue share' },
    ],
  },
  {
    id: 'stockout-prevent',
    effort: 'medium', impact: 'medium', timeframe: 'this-week',
    type: 'operations',
    title: { ko: '피크 시간 품절 방지 발주 조정', en: 'Adjust orders to prevent peak-hour stockouts' },
    summary: {
      ko: '점심·저녁 피크 시간대 재고 부족이 매출 손실로 이어지지 않도록 발주 안전재고를 늘립니다.',
      en: 'Raise safety stock so peak-hour shortages do not bleed back into the uplift.',
    },
    tied: ['demand-up'],
    steps: [
      { ko: '피크 시간대 품절 이슈 확인', en: 'Audit peak-hour stockouts' },
      { ko: '핵심 SKU 안전재고 +20%', en: 'Add 20% safety stock to core SKUs' },
      { ko: '주중 재발주 일정 재확인', en: 'Reconfirm midweek reorder schedule' },
    ],
  },
  {
    id: 'expand-set',
    effort: 'medium', impact: 'high', timeframe: 'next-2-weeks',
    type: 'menu_amplify',
    title: { ko: '성공한 세트 라인 확장 테스트', en: 'Test an expanded variant of the set line' },
    summary: {
      ko: '객단가 상승 신호가 일시적인지 메뉴 믹스 영향인지 확인하기 위해 인접 변형 세트를 1개 추가합니다.',
      en: 'Add one adjacent variant to test whether the ticket lift comes from menu mix.',
    },
    tied: ['ticket-up'],
    steps: [
      { ko: '판매 비중 상위 SKU 확인', en: 'Pick top-share SKUs' },
      { ko: '변형 세트 1종 등록', en: 'Add one variant set' },
      { ko: '2주간 효과 비교', en: 'Compare for 2 weeks' },
    ],
  },
  {
    id: 'repeat-validate',
    effort: 'low', impact: 'medium', timeframe: 'this-week',
    type: 'validation',
    title: { ko: '다음 주 같은 상승이 반복되는지 확인', en: 'Validate if the lift repeats next week' },
    summary: {
      ko: '날씨·이벤트 등 일시적 요인이 사라진 다음 주에도 매출이 유지되는지 확인합니다. 일시적 상승과 구조적 상승을 구분합니다.',
      en: 'Check whether the uplift persists once weather/event tailwinds fade — distinguish a one-off bump from a structural shift.',
    },
    tied: ['demand-up', 'weather-up'],
    steps: [
      { ko: '다음 주 동요일 매출 비교', en: 'Compare same-DOW revenue next week' },
      { ko: '날씨/이벤트 메모 첨부', en: 'Annotate weather/events' },
      { ko: '브리프에 결과 기록', en: 'Log result in the brief' },
    ],
  },
  {
    id: 'newcustomer-retain',
    effort: 'medium', impact: 'high', timeframe: 'next-2-weeks',
    type: 'crm',
    title: { ko: '신규 고객을 단골로 전환하는 리텐션 흐름', en: 'Convert new customers into repeat visitors' },
    summary: {
      ko: '거래건수 증가 시점에 유입된 신규 고객을 재방문 단골로 전환하기 위한 멤버십·재방문 쿠폰 흐름을 운영합니다.',
      en: 'Run a membership / repeat-coupon flow to turn the new customers riding the lift into regulars.',
    },
    tied: ['demand-up', 'ticket-up'],
    steps: [
      { ko: '첫 방문 고객 식별', en: 'Identify first-visit customers' },
      { ko: '재방문 쿠폰 자동 발송', en: 'Auto-send a repeat coupon' },
      { ko: '4주 재방문율 확인', en: 'Check 4-week return rate' },
    ],
  },
  {
    id: 'event-hedge',
    effort: 'low', impact: 'medium', timeframe: 'next-month',
    type: 'hedge',
    title: { ko: '이벤트성 상승일 경우 사후 리텐션 준비', en: 'Prepare post-event retention if uplift is event-driven' },
    summary: {
      ko: '인근 행사·날씨 효과로 인한 일시 상승이라면, 행사 종료 후 매출이 떨어질 것에 대비한 단골 흐름을 미리 준비합니다.',
      en: 'If the lift is event/weather driven, prepare a regulars-flow now so revenue does not fall back after the event ends.',
    },
    tied: ['weather-up'],
    steps: [
      { ko: '행사 종료 시점 확인', en: 'Identify event end date' },
      { ko: '단골 대상 캠페인 초안', en: 'Draft regulars-only campaign' },
      { ko: '종료 1주 전 발송', en: 'Send 1 week before end' },
    ],
  },
];

export function buildUpsideScenario(base: Scenario): Scenario {
  return {
    ...base,
    revenueChange: +18.4,
    txnChange: +9.1,
    ticketChange: +4.7,
    populationChange: +6.2,
    competitorChange: -3.2,
    rainyDayChange: -32.0,
    revSeries: [
      { label: '23Q1', v: 92.4 },
      { label: '23Q2', v: 96.1 },
      { label: '23Q3', v: 99.0 },
      { label: '23Q4', v: 101.5 },
      { label: '24Q1', v: 103.2 },
      { label: '24Q2', v: 105.1 },
      { label: '24Q3', v: 100.0 },
      { label: '24Q4', v: 118.4 },
    ],
    causes: UPSIDE_CAUSES,
    actions: UPSIDE_ACTIONS,
  };
}
