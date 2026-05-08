// Seoul Open Data 상권분석서비스 (VwsmTrdarSelngQq) — service industry codes
// for the food-service MVP. Codes match the 서비스_업종_코드 column on
// VwsmTrdarSelngQq / VwsmTrdarFlpopQq / VwsmTrdarStorQq.
//
// Repo has no pre-existing CS100xxx mapping; this list is the canonical
// food-service subset for the Revenue Ops MVP. Do NOT hardcode public_category
// schema metadata — store the chosen code in payload.business_category and
// keep label/source in payload.metadata.

export interface SeoulServiceCategory {
  code: string;
  ko: string;
  en: string;
}

export const SEOUL_COMMERCIAL_SALES_ENDPOINT = 'VwsmTrdarSelngQq';

export const SEOUL_SERVICE_CATEGORIES: SeoulServiceCategory[] = [
  { code: 'CS100001', ko: '한식음식점',     en: 'Korean Restaurant' },
  { code: 'CS100002', ko: '중식음식점',     en: 'Chinese Restaurant' },
  { code: 'CS100003', ko: '일식음식점',     en: 'Japanese Restaurant' },
  { code: 'CS100004', ko: '양식음식점',     en: 'Western Restaurant' },
  { code: 'CS100005', ko: '제과점',         en: 'Bakery' },
  { code: 'CS100006', ko: '패스트푸드점',   en: 'Fast Food' },
  { code: 'CS100007', ko: '치킨전문점',     en: 'Chicken Restaurant' },
  { code: 'CS100008', ko: '분식전문점',     en: 'Bunsik' },
  { code: 'CS100009', ko: '호프-간이주점',  en: 'Pub & Bar' },
  { code: 'CS100010', ko: '커피-음료',      en: 'Coffee & Beverage' },
];

const BY_CODE = new Map<string, SeoulServiceCategory>(
  SEOUL_SERVICE_CATEGORIES.map(category => [category.code, category]),
);

export function isSeoulServiceCategoryCode(value: string | null | undefined): boolean {
  if (!value) return false;
  return BY_CODE.has(value);
}

export function findSeoulServiceCategory(value: string | null | undefined): SeoulServiceCategory | null {
  if (!value) return null;
  return BY_CODE.get(value) ?? null;
}

export function seoulCategoryLabel(value: string | null | undefined, lang: 'ko' | 'en'): string {
  const match = findSeoulServiceCategory(value);
  if (match) return match[lang];
  return value ?? '';
}
