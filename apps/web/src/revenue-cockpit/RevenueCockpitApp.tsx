import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import {
  apiCollectStoreContext,
  apiCreateStore,
  apiArchiveStore,
  apiCreateRevenueUpload,
  apiPreviewRevenueUpload,
  apiFetchActions,
  apiFetchAnomalies,
  apiFetchBriefs,
  apiFetchContext,
  apiFetchPipelineMeta,
  apiFetchStores,
  apiUpdateActionStatus,
  RevenueApiError,
  type ContextBootstrapHint,
  type CreateRevenueStorePayload,
  type RevenueUploadEnvelope,
  type RevenueUploadPayload,
  type RevenueUploadPreviewEnvelope,
  type RevenueStoreSummary,
} from './revenueCockpitApi';
import {
  getStoredCognitoToken,
  getStoredAuthSession,
  buildCognitoLogoutUrl,
  clearStoredAuthSession,
  markRevenueLogoutRedirect,
} from './revenueCockpitAuth';
import type { RevenueAuthSession } from './revenueCockpitAuth';
import { buildScenarioFromApi, wantsApiData } from './revenueCockpitData';
import { Icon, ChromeBar } from './revenueCockpitShared';
import { AuthPopover } from './AuthPopover';
import {
  SEOUL_SERVICE_CATEGORIES,
  SEOUL_COMMERCIAL_SALES_ENDPOINT,
  findSeoulServiceCategory,
  seoulCategoryLabel,
} from './seoulServiceCategories';
import { RevenueBriefView } from './RevenueBriefView';
import { CauseEvidenceView } from './CauseEvidenceView';
import { ActionPlannerView } from './ActionPlannerView';
import { DataReliabilityView } from './DataReliabilityView';
import type { RcLang, RcTheme, RcScreen, ActionStatuses, ActionStatus, Scenario } from './revenueCockpitTypes';

// ─── persistence helpers ──────────────────────────────────────────────────────

const SELECTED_STORE_KEY = 'revenue_ops_selected_store_id';
const POSTCODE_SCRIPT_ID = 'daum-postcode-script';

type StoreCreateForm = CreateRevenueStorePayload & {
  address_source?: string;
  detail_address?: string;
  postal_code?: string;
  road_address?: string;
  jibun_address?: string;
};

type DaumPostcodeData = {
  address?: string;
  roadAddress?: string;
  jibunAddress?: string;
  zonecode?: string;
  sido?: string;
  sigungu?: string;
  bname?: string;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void };
    };
  }
}

function loadPref<T extends string>(key: string, fallback: T, valid: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function loadSelectedStoreId(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_STORE_KEY) || localStorage.getItem(SELECTED_STORE_KEY);
  } catch {
    return null;
  }
}

function saveSelectedStoreId(storeId: string | null) {
  try {
    if (storeId) {
      sessionStorage.setItem(SELECTED_STORE_KEY, storeId);
      localStorage.setItem(SELECTED_STORE_KEY, storeId);
    } else {
      sessionStorage.removeItem(SELECTED_STORE_KEY);
      localStorage.removeItem(SELECTED_STORE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function loadPostcodeScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();

  const existing = document.getElementById(POSTCODE_SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('postcode_script_failed')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = POSTCODE_SCRIPT_ID;
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('postcode_script_failed'));
    document.head.appendChild(script);
  });
}

function regionFromPostcode(data: DaumPostcodeData): string | undefined {
  return [data.sido, data.sigungu, data.bname].filter(Boolean).join(' ') || undefined;
}

function resolveTheme(theme: RcTheme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

// ─── header (brand + tab nav + optional store bar) ───────────────────────────

// Report-level navigation for the selected store. Rendered on its own row,
// right-aligned, beneath the store toolbar — distinct from global product
// nav.
function RcReportNavRow({
  lang,
  screen,
  onSetScreen,
  periodLabel,
}: {
  lang: RcLang;
  screen: RcScreen;
  onSetScreen: (s: RcScreen) => void;
  periodLabel?: string | null;
}) {
  const items: Array<{ id: RcScreen; label: string }> = [
    { id: 'brief',       label: lang === 'ko' ? '매출 요약' : 'Revenue summary' },
    { id: 'evidence',    label: lang === 'ko' ? '원인 근거' : 'Cause evidence' },
    { id: 'actions',     label: lang === 'ko' ? '실행 계획' : 'Action plan' },
    { id: 'reliability', label: lang === 'ko' ? '데이터 상태' : 'Data status' },
  ];
  return (
    <div className="rc-report-nav-row">
      <div className="rc-report-nav-period">
        {periodLabel ? periodLabel : (lang === 'ko' ? '선택된 매장 리포트' : 'Selected store report')}
      </div>
      <nav className="rc-report-nav">
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            className={`rc-report-nav-tab${screen === it.id ? ' is-active' : ''}`}
            onClick={() => onSetScreen(it.id)}
          >
            {it.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

interface StoreBarShellProps {
  storeBar?: ReactNode;
}
function StoreBarShell({ storeBar }: StoreBarShellProps) {
  if (!storeBar) return null;
  return (
    <header className="rc-header">
      <div className="rc-header-store-bar">
        {storeBar}
      </div>
    </header>
  );
}

interface StoreSwitcherProps {
  lang: RcLang;
  stores: RevenueStoreSummary[];
  selectedStoreId: string | null;
  loading: boolean;
  notice: string | null;
  showCreate: boolean;
  createError: string | null;
  form: StoreCreateForm;
  onSelectStore: (storeId: string) => void;
  onOpenCreate: () => void;
  onCancelCreate: () => void;
  onChangeForm: (patch: Partial<StoreCreateForm>) => void;
  onCreateStore: () => void;
  onOpenAddressSearch: () => void;
  onOpenRevenueUpload: () => void;
  onArchiveStore?: () => void;
  canArchive?: boolean;
  compact?: boolean;
}

interface BootstrapCollector {
  name?: string;
  status?: string;
  source_name?: string;
  reason?: string | null;
  duration_ms?: number | null;
}

interface BootstrapStatus {
  storeId: string;
  phase: 'collecting' | 'ready' | 'partial' | 'failed' | 'skipped';
  collectors: BootstrapCollector[];
  completed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  message?: string;
}

const BOOTSTRAP_GROUPS = [
  { key: 'registered', names: [],                  ko: '가게 등록 완료',     en: 'Store registered' },
  { key: 'location',   names: ['kakao_geocoding'], ko: '주소·상권 확인',     en: 'Address & trade area' },
  { key: 'baseline',   names: [],                  ko: '매출 기준 설정',     en: 'Revenue baseline' },
  { key: 'population', names: ['seoul_foot_traffic_proxy'], ko: '생활인구 수집',  en: 'Foot traffic' },
  { key: 'weather',    names: ['kma_weather'],     ko: '날씨 수집',          en: 'Weather' },
  { key: 'commerce',   names: ['seoul_commercial_benchmark', 'seoul_store_density_proxy', 'naver_local_competitor_search'], ko: '점포·경쟁 맥락', en: 'Stores & competition' },
  { key: 'ready',      names: [],                  ko: '초기 분석 준비',     en: 'Initial analysis ready' },
];

function summarizeBootstrapFromMeta(storeId: string, pipelineMeta: Record<string, unknown> | undefined): BootstrapStatus | null {
  const latestRun = isRecord(pipelineMeta?.latest_collector_run) ? pipelineMeta.latest_collector_run : undefined;
  const metadata = isRecord(latestRun?.metadata) ? latestRun.metadata : {};
  const collectors = Array.isArray(metadata.collectors) ? metadata.collectors.filter(isRecord) as BootstrapCollector[] : [];
  if (!latestRun && collectors.length === 0) return null;
  const completed = Number(pipelineMeta?.completed_collector_count ?? metadata.completed_collector_count ?? collectors.filter(c => c.status === 'completed').length) || 0;
  const failed = Number(pipelineMeta?.failed_collector_count ?? metadata.failed_collector_count ?? collectors.filter(c => c.status === 'failed').length) || 0;
  const skipped = Number(pipelineMeta?.skipped_collector_count ?? metadata.skipped_collector_count ?? collectors.filter(c => c.status === 'skipped').length) || 0;
  const timedOut = Number(pipelineMeta?.timed_out_collector_count ?? metadata.timed_out_collector_count ?? collectors.filter(c => c.reason === 'request_timeout').length) || 0;
  const runStatus = typeof latestRun?.status === 'string' ? latestRun.status : 'completed';
  const phase: BootstrapStatus['phase'] = runStatus === 'running'
    ? 'collecting'
    : failed > 0 || timedOut > 0
      ? 'partial'
      : completed > 0 || skipped > 0
        ? 'ready'
        : 'skipped';
  return { storeId, phase, collectors, completed, failed, skipped, timedOut };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type StepState = 'done' | 'in-progress' | 'pending' | 'partial';

function collectorGroupState(status: BootstrapStatus | null, names: string[]): StepState {
  if (!status) return 'pending';
  if (names.length === 0) return status.phase === 'collecting' ? 'in-progress' : 'done';
  const matching = status.collectors.filter(collector => names.includes(String(collector.name ?? '')));
  if (matching.length === 0) return status.phase === 'collecting' ? 'in-progress' : 'pending';
  if (matching.some(collector => collector.status === 'completed')) return 'done';
  if (matching.some(collector => collector.status === 'failed')) return 'partial';
  if (matching.every(collector => collector.status === 'skipped')) return 'partial';
  return 'in-progress';
}

function OnboardingBootstrapPanel({
  lang,
  status,
  onRetry,
}: {
  lang: RcLang;
  status: BootstrapStatus;
  onRetry: () => void;
}) {
  const isCollecting = status.phase === 'collecting';
  const isPartial    = status.phase === 'partial' || status.phase === 'failed';
  const isReady      = status.phase === 'ready';

  const title = isCollecting
    ? (lang === 'ko' ? '맥락 수집 중...' : 'Collecting context...')
    : isPartial
      ? (lang === 'ko' ? '맥락 수집 지연 · 재시도 가능' : 'Context collection delayed · retry available')
      : isReady
        ? (lang === 'ko' ? '초기 맥락데이터 수집이 완료되었습니다.' : 'Initial context collection is complete.')
        : (lang === 'ko' ? '맥락데이터 수집이 준비되지 않았습니다.' : 'Context collection is not ready.');

  const body = isCollecting
    ? (lang === 'ko' ? '함께 관측된 신호를 준비하고 있으며, 인과가 확정된 것은 아닙니다.' : 'Preparing observed-together signals; this does not prove causality.')
    : isPartial
      ? (lang === 'ko' ? '기존 수집 데이터를 바탕으로 분석을 계속할 수 있습니다.' : 'Analysis can continue from the existing collected data.')
      : isReady
        ? (lang === 'ko' ? '현재 수집된 데이터를 바탕으로 초기 분석을 시작할 수 있습니다.' : 'You can start the initial analysis from the collected data.')
        : (lang === 'ko' ? '주소와 업종을 보강하면 맥락 수집을 시작할 수 있습니다.' : 'Add address and category to collect context.');

  return (
    <section className="rc-bootstrap-panel" aria-label={lang === 'ko' ? '초기 맥락 수집 상태' : 'Bootstrap status'}>
      <div className="rc-bootstrap-head">
        <div>
          <div className="rc-bootstrap-kicker">{lang === 'ko' ? '온보딩 맥락 수집' : 'Onboarding context collection'}</div>
          <strong>{title}</strong>
          <p>{body}</p>
        </div>
        {/* retry button: hidden while collecting, shown after completion or on partial failure */}
        {!isCollecting && (
          <button type="button" className="rc-store-button" onClick={onRetry}>
            {lang === 'ko' ? '맥락데이터 다시 수집' : 'Collect context again'}
          </button>
        )}
      </div>
      <ol className="rc-bootstrap-steps">
        {BOOTSTRAP_GROUPS.map((group, index) => {
          const state: StepState = group.key === 'registered'
            ? 'done'
            : group.key === 'baseline'
              ? (status.phase === 'collecting' || status.phase === 'skipped' ? 'in-progress' : 'done')
              : group.key === 'ready'
                ? (status.phase === 'ready' || status.phase === 'partial' ? 'done' : 'pending')
                : collectorGroupState(status, group.names);
          const iconName = state === 'done'
            ? 'check'
            : state === 'in-progress'
              ? 'spark'
              : state === 'partial'
                ? 'shield'
                : 'dot';
          return (
            <li key={group.key} className={`rc-bootstrap-step rc-bootstrap-step-${state}`}>
              <span className="rc-bootstrap-step-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className="rc-bootstrap-step-icon"><Icon name={iconName} size={12}/></span>
              <span className="rc-bootstrap-step-label">{lang === 'ko' ? group.ko : group.en}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StoreSwitcher({
  lang,
  stores,
  selectedStoreId,
  loading,
  notice,
  showCreate,
  createError,
  form,
  onSelectStore,
  onOpenCreate,
  onCancelCreate,
  onChangeForm,
  onCreateStore,
  onOpenAddressSearch,
  onOpenRevenueUpload,
  onArchiveStore,
  canArchive = false,
  compact = false,
}: StoreSwitcherProps) {
  return (
    <section className={compact ? 'rc-store-switcher rc-store-switcher-compact' : 'rc-store-switcher'} aria-label={lang === 'ko' ? '가게 선택' : 'Store'}>
      <div className="rc-store-switcher-row">
        <label className="rc-store-label" htmlFor="rc-store-select">{lang === 'ko' ? '가게 선택' : 'Store'}</label>
        <select
          id="rc-store-select"
          className="rc-store-select"
          value={selectedStoreId ?? ''}
          disabled={loading || stores.length === 0}
          onChange={event => onSelectStore(event.target.value)}
        >
          {stores.length === 0 && (
            <option value="">{lang === 'ko' ? '가게 미등록' : 'No store yet'}</option>
          )}
          {stores.map(store => (
            <option key={store.store_id} value={store.store_id}>
              {formatStoreOption(store, lang)}
            </option>
          ))}
        </select>
        <button type="button" className="rc-store-button" onClick={onOpenCreate}>
          {lang === 'ko' ? '새 가게 등록' : 'Add store'}
        </button>
        {selectedStoreId && (
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={onOpenRevenueUpload}>
            {lang === 'ko' ? '매출 데이터 등록하기' : 'Add revenue data'}
          </button>
        )}
        {canArchive && onArchiveStore && (
          <button type="button" className="rc-store-button" onClick={onArchiveStore} title={lang === 'ko' ? '선택된 매장 보관' : 'Archive selected store'}>
            {lang === 'ko' ? '보관' : 'Archive'}
          </button>
        )}
        {notice && <span className="rc-store-notice">{notice}</span>}
      </div>
      {showCreate && (
        <div className="rc-store-create-panel" role="dialog" aria-label={lang === 'ko' ? '새 가게 등록' : 'Add store'}>
          <div className="rc-store-create-head">
            <strong>{lang === 'ko' ? '새 가게 등록' : 'Add store'}</strong>
            <button type="button" className="rc-store-create-close" onClick={onCancelCreate}>
              {lang === 'ko' ? '취소' : 'Cancel'}
            </button>
          </div>
          <div className="rc-store-create">
            <input
              className="rc-store-input"
              value={form.store_name}
              placeholder={lang === 'ko' ? '가게 이름 *' : 'Store name *'}
              onChange={event => onChangeForm({ store_name: event.target.value })}
              required
            />
            <input
              className="rc-store-input"
              value={form.tenant_name ?? ''}
              placeholder={lang === 'ko' ? '건물명 / 호수 (선택)' : 'Building / Suite (optional)'}
              onChange={event => onChangeForm({ tenant_name: event.target.value })}
            />
            <select
              className="rc-store-select"
              value={form.business_category ?? ''}
              onChange={event => onChangeForm({ business_category: event.target.value })}
              required
            >
              <option value="">{lang === 'ko' ? '업종 선택 (서울 상권코드) *' : 'Select category (Seoul code) *'}</option>
              {SEOUL_SERVICE_CATEGORIES.map(category => (
                <option key={category.code} value={category.code}>
                  {category.code} · {category[lang]}
                </option>
              ))}
            </select>
            <input
              className="rc-store-input"
              value={form.region ?? ''}
              placeholder={lang === 'ko' ? '지역 (주소 검색으로 자동)' : 'Region (auto from search)'}
              readOnly
              tabIndex={-1}
              aria-readonly
            />
            <input
              className="rc-store-input rc-store-input-wide"
              value={form.address_text ?? ''}
              placeholder={lang === 'ko' ? '주소 검색으로 주소를 선택해 주세요 *' : 'Select address via search *'}
              readOnly
              tabIndex={-1}
              aria-readonly
              onClick={onOpenAddressSearch}
            />
            <button type="button" className="rc-store-button" onClick={onOpenAddressSearch}>
              {lang === 'ko' ? '주소 검색' : 'Search address'}
            </button>
            <input
              className="rc-store-input"
              value={form.detail_address ?? ''}
              placeholder={lang === 'ko' ? '상세 주소 (선택)' : 'Detail address (optional)'}
              onChange={event => onChangeForm({ detail_address: event.target.value })}
            />
            <button type="button" className="rc-store-button rc-store-button-primary" onClick={onCreateStore} disabled={loading}>
              {lang === 'ko' ? '등록' : 'Create'}
            </button>
          </div>
          {createError && (
            <div className="rc-store-create-error rc-prose">
              {createError}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Header context summary: prefer the selected store's metadata; fall back to
// the active scenario. Pending create-store form inputs must NOT leak in here.
// Empty/junk fields are hidden rather than rendered as "업종 미입력".
function buildHeaderContext(lang: RcLang, scenario: Scenario, store: RevenueStoreSummary | null): string {
  if (store) {
    const meta = store.metadata ?? {};
    const labelFromMeta = lang === 'ko'
      ? (typeof meta.business_category_label === 'string' ? meta.business_category_label : null)
      : (typeof meta.business_category_label_en === 'string' ? meta.business_category_label_en : null);
    const category = labelFromMeta
      || seoulCategoryLabel(store.business_category, lang)
      || store.business_category
      || null;
    const region = (typeof store.region === 'string' && store.region.trim()) ? store.region : null;
    const period = scenario.periodLabel || scenario.compare[lang];
    const parts = [region, category, period].filter((value): value is string => Boolean(value && value.trim()));
    return parts.join(' · ');
  }
  return `${scenario.area[lang]} · ${scenario.category[lang]} · ${scenario.compare[lang]}`;
}

function formatStoreOption(store: RevenueStoreSummary, lang: RcLang): string {
  const meta = store.metadata ?? {};
  const labelFromMeta = lang === 'ko'
    ? (typeof meta.business_category_label === 'string' ? meta.business_category_label : null)
    : (typeof meta.business_category_label_en === 'string' ? meta.business_category_label_en : null);
  const categoryDisplay = labelFromMeta
    || seoulCategoryLabel(store.business_category, lang)
    || store.business_category
    || store.store_type;
  const parts = [
    store.store_name,
    categoryDisplay,
    store.region,
  ].filter(Boolean);
  if (isDemoStore(store)) parts.push('Demo');
  return parts.join(' · ');
}

function isDemoStore(store: RevenueStoreSummary | null | undefined): boolean {
  return Boolean(store && (
    store.store_type === 'demo'
    || store.tenant_type === 'demo'
    || store.metadata?.is_demo === true
  ));
}

function chooseInitialStore(stores: RevenueStoreSummary[], saved: string | null): string | null {
  const savedStore = stores.find(store => store.store_id === saved);
  if (savedStore) return savedStore.store_id;

  const nonDemoStores = stores
    .map((store, index) => ({
      store,
      score: Number.isFinite(Date.parse(store.created_at ?? ''))
        ? Date.parse(store.created_at ?? '')
        : index,
    }))
    .filter(item => item.store.store_type !== 'demo')
    .sort((a, b) => b.score - a.score);

  return nonDemoStores[0]?.store.store_id ?? stores[0]?.store_id ?? null;
}

interface RevenueUploadPanelProps {
  lang: RcLang;
  storeId: string;
  onClose: () => void;
  onUploaded: () => void;
}

function RevenueUploadPanel({ lang, storeId, onClose, onUploaded }: RevenueUploadPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [businessDate, setBusinessDate] = useState(today);
  const [grossSales, setGrossSales] = useState('');
  const [transactionCount, setTransactionCount] = useState('');
  const [averageTicket, setAverageTicket] = useState('');
  const [channel, setChannel] = useState('offline_pos');
  const [csvText, setCsvText] = useState('');
  const [csvFilename, setCsvFilename] = useState('');
  const [sourceType, setSourceType] = useState('generic_pos_csv');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<RevenueUploadPreviewEnvelope | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<RevenueUploadEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview is tied to the current csvText/sourceType. If either changes, the
  // existing preview is no longer accurate and is cleared.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [csvText, sourceType]);

  function finishUpload(envelope: RevenueUploadEnvelope) {
    setResult(envelope);
    setError(null);
    onUploaded();
  }

  function buildCsvPayload(): RevenueUploadPayload {
    return {
      source_type: sourceType,
      parser_type: sourceType === 'generic_pos_csv' ? 'standard_daily_revenue_csv' : sourceType,
      original_filename: csvFilename || `${sourceType}.csv`,
      file_type: 'csv',
      csv_text: csvText,
      metadata: {
        upload_mode: 'csv',
        no_raw_delivery_login_credentials: true,
      },
    };
  }

  async function submit(payload: RevenueUploadPayload) {
    setBusy(true);
    setError(null);
    try {
      const envelope = await apiCreateRevenueUpload(storeId, payload);
      finishUpload(envelope);
    } catch {
      setError(lang === 'ko'
        ? '매출 데이터 등록에 실패했습니다. 날짜, 금액, 거래건수를 확인해주세요.'
        : 'Could not upload revenue data. Check the date, amount, and transaction count.');
    } finally {
      setBusy(false);
    }
  }

  async function previewCsv() {
    if (!csvText.trim()) {
      setPreviewError(lang === 'ko' ? '미리보기할 CSV 내용을 선택하거나 붙여넣어주세요.' : 'Choose or paste CSV content to preview.');
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const envelope = await apiPreviewRevenueUpload(storeId, buildCsvPayload());
      setPreview(envelope);
    } catch {
      setPreview(null);
      setPreviewError(lang === 'ko'
        ? 'CSV 미리보기를 불러오지 못했습니다. 헤더와 형식을 확인해주세요.'
        : 'Could not load preview. Check headers and format.');
    } finally {
      setPreviewBusy(false);
    }
  }

  function submitManual() {
    const transactions = Number(transactionCount);
    const gross = Number(grossSales || 0) || (Number(averageTicket || 0) * transactions);
    if (!businessDate || !Number.isFinite(gross) || gross <= 0 || !Number.isFinite(transactions) || transactions < 0) {
      setError(lang === 'ko'
        ? '영업일, 매출액, 거래건수를 입력해주세요.'
        : 'Enter business date, sales amount, and transaction count.');
      return;
    }

    void submit({
      source_type: 'manual_template',
      original_filename: 'manual_daily_input.json',
      daily_rows: [{
        business_date: businessDate,
        gross_sales_amount: Math.round(gross),
        net_sales_amount: Math.round(gross),
        order_count: Math.round(transactions),
        channel: channel || 'offline_pos',
      }],
      metadata: {
        input_mode: 'manual_daily',
        average_ticket: averageTicket ? Number(averageTicket) : null,
      },
    });
  }

  function submitCsv() {
    if (!csvText.trim()) {
      setError(lang === 'ko' ? '업로드할 CSV 내용을 선택하거나 붙여넣어주세요.' : 'Choose or paste CSV content.');
      return;
    }

    void submit(buildCsvPayload());
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    setCsvFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setError(lang === 'ko' ? 'CSV 파일을 읽지 못했습니다.' : 'Could not read the CSV file.');
    };
    reader.readAsText(file);
  }

  return (
    <section className="rc-revenue-upload-panel" aria-label={lang === 'ko' ? '매출 데이터 등록' : 'Revenue data upload'}>
      <div className="rc-revenue-upload-head">
        <div>
          <div className="rc-bootstrap-kicker">{lang === 'ko' ? '매출 데이터 등록' : 'Revenue data upload'}</div>
          <strong>{lang === 'ko' ? '매출 데이터 등록' : 'Add revenue data'}</strong>
          <p>
            {lang === 'ko'
              ? 'POS에서 내려받은 CSV를 업로드하거나, 테스트용 일별 매출을 직접 입력할 수 있습니다.'
              : 'Upload a POS CSV or enter a test daily sales row manually.'}
          </p>
          <p>
            {lang === 'ko'
              ? '매출 데이터가 등록되면 원인 후보와 실행 액션이 갱신됩니다.'
              : 'Cause candidates and action suggestions refresh after revenue data is registered.'}
          </p>
        </div>
        <button type="button" className="rc-store-button" onClick={onClose}>
          {lang === 'ko' ? '닫기' : 'Close'}
        </button>
      </div>

      <div className="rc-revenue-upload-grid">
        <div className="rc-card rc-revenue-upload-card">
          <h2>{lang === 'ko' ? '일별 매출 직접 입력' : 'Manual daily input'}</h2>
          <div className="rc-revenue-upload-fields">
            <input className="rc-store-input" type="date" value={businessDate} onChange={event => setBusinessDate(event.target.value)}/>
            <input className="rc-store-input" inputMode="numeric" value={grossSales} placeholder={lang === 'ko' ? '총매출' : 'Gross sales'} onChange={event => setGrossSales(event.target.value)}/>
            <input className="rc-store-input" inputMode="numeric" value={transactionCount} placeholder={lang === 'ko' ? '거래건수' : 'Transactions'} onChange={event => setTransactionCount(event.target.value)}/>
            <input className="rc-store-input" inputMode="numeric" value={averageTicket} placeholder={lang === 'ko' ? '객단가 선택' : 'Avg. ticket optional'} onChange={event => setAverageTicket(event.target.value)}/>
            <select className="rc-store-select" value={channel} onChange={event => setChannel(event.target.value)}>
              <option value="offline_pos">{lang === 'ko' ? '오프라인' : 'Offline'}</option>
              <option value="delivery_baemin">Baemin</option>
              <option value="delivery_coupangeats">CoupangEats</option>
              <option value="online">Online</option>
            </select>
          </div>
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={submitManual} disabled={busy}>
            {lang === 'ko' ? '일별 매출 등록' : 'Add daily row'}
          </button>
        </div>

        <div className="rc-card rc-revenue-upload-card">
          <h2>{lang === 'ko' ? 'CSV 업로드' : 'CSV upload'}</h2>
          <p className="rc-upload-note">
            {lang === 'ko'
              ? '배달앱 계정 로그인 정보는 저장하지 않습니다. 내려받은 정산/주문 파일만 업로드합니다.'
              : 'Delivery account login credentials are not stored. Upload only exported settlement/order files.'}
          </p>
          <div className="rc-csv-source-row">
            <select className="rc-store-select rc-csv-source-select" value={sourceType} onChange={event => setSourceType(event.target.value)}>
              <option value="generic_pos_csv">{lang === 'ko' ? '표준 일별 매출 CSV' : 'Standard daily sales CSV'}</option>
              <option value="baemin_orders_csv">Baemin orders CSV</option>
              <option value="coupangeats_orders_csv">CoupangEats orders CSV</option>
            </select>
            <input className="rc-file-input rc-csv-file-input" type="file" accept=".csv,text/csv" onChange={event => onFileSelected(event.target.files?.[0] ?? null)}/>
          </div>
          <textarea
            className="rc-revenue-csv"
            value={csvText}
            placeholder="business_date,channel,gross_sales_amount,order_count"
            onChange={event => setCsvText(event.target.value)}
          />
          <div className="rc-revenue-upload-actions">
            <button type="button" className="rc-store-button" onClick={previewCsv} disabled={previewBusy || busy}>
              {previewBusy
                ? (lang === 'ko' ? '미리보기 확인 중...' : 'Checking preview...')
                : (lang === 'ko' ? 'CSV 미리보기' : 'Preview CSV')}
            </button>
            <button type="button" className="rc-store-button rc-store-button-primary" onClick={submitCsv} disabled={busy}>
              {lang === 'ko' ? 'CSV 등록' : 'Upload CSV'}
            </button>
          </div>
        </div>
      </div>

      {previewError && <div className="rc-upload-result rc-upload-error">{previewError}</div>}
      {preview && <UploadPreviewCard lang={lang} preview={preview}/>}

      {error && <div className="rc-upload-result rc-upload-error">{error}</div>}
      {result?.upload && (
        <div className="rc-upload-result">
          <strong>{lang === 'ko' ? '새 매출 근거 등록 완료' : 'New revenue evidence registered'}</strong>
          <span>
            {lang === 'ko'
              ? `승인 ${result.upload.accepted_count ?? result.accepted_count ?? 0}행 · 반려 ${result.upload.rejected_count ?? result.rejected_count ?? 0}행`
              : `Accepted ${result.upload.accepted_count ?? result.accepted_count ?? 0} rows · Rejected ${result.upload.rejected_count ?? result.rejected_count ?? 0} rows`}
          </span>
          <span>
            {lang === 'ko'
              ? '새 매출 근거가 등록되었습니다. 브리프와 원인 후보가 갱신됩니다.'
              : 'New revenue evidence was registered. The brief and cause candidates will refresh.'}
          </span>
          {(result.rejected_rows?.length ?? 0) > 0 && (
            <span>{lang === 'ko' ? '반려 행은 날짜/금액 형식을 확인해주세요.' : 'Rejected rows usually need date or amount format fixes.'}</span>
          )}
        </div>
      )}
    </section>
  );
}

function formatMappingValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function UploadPreviewCard({ lang, preview }: { lang: RcLang; preview: RevenueUploadPreviewEnvelope }) {
  const accepted = preview.accepted_count ?? 0;
  const rejected = preview.rejected_count ?? 0;
  const total = preview.row_count ?? accepted + rejected;
  const detected = preview.detected_columns ?? [];
  const dailyMapping = preview.proposed_mapping?.daily ?? null;
  const itemMapping = preview.proposed_mapping?.item ?? null;
  const mappingEntries = Object.entries(dailyMapping ?? itemMapping ?? {});
  const rejectedRows = (preview.rejected_rows ?? []).slice(0, 3);

  return (
    <div className="rc-upload-preview-card" aria-label={lang === 'ko' ? '미리보기 결과' : 'Preview result'}>
      <div className="rc-upload-preview-head">
        <h3 className="rc-upload-preview-title">
          {lang === 'ko' ? '미리보기 결과' : 'Preview result'}
        </h3>
        <span className="rc-upload-preview-meta">
          {preview.parser_type
            ? (lang === 'ko' ? `파서: ${preview.parser_type}` : `Parser: ${preview.parser_type}`)
            : null}
        </span>
      </div>

      <div className="rc-upload-preview-chips">
        <span className="rc-upload-preview-chip rc-upload-preview-chip-good">
          {lang === 'ko' ? `승인 ${accepted}행` : `Accepted ${accepted}`}
        </span>
        <span className={`rc-upload-preview-chip${rejected > 0 ? ' rc-upload-preview-chip-bad' : ''}`}>
          {lang === 'ko' ? `반려 ${rejected}행` : `Rejected ${rejected}`}
        </span>
        <span className="rc-upload-preview-chip">
          {lang === 'ko' ? `총 ${total}행` : `Total ${total}`}
        </span>
        {preview.parser_type && (
          <span className="rc-upload-preview-chip">{preview.parser_type}</span>
        )}
      </div>

      {detected.length > 0 && (
        <div className="rc-upload-preview-section">
          <div className="rc-upload-preview-section-label">
            {lang === 'ko' ? '감지된 컬럼' : 'Detected columns'}
          </div>
          <div className="rc-upload-preview-chips">
            {detected.map(col => (
              <span key={col} className="rc-upload-preview-chip">{col}</span>
            ))}
          </div>
        </div>
      )}

      {mappingEntries.length > 0 && (
        <div className="rc-upload-preview-section">
          <div className="rc-upload-preview-section-label">
            {lang === 'ko'
              ? (dailyMapping ? '제안된 매핑 · 일별' : '제안된 매핑 · 항목')
              : (dailyMapping ? 'Proposed mapping · daily' : 'Proposed mapping · item')}
          </div>
          <dl className="rc-upload-preview-mapping">
            {mappingEntries.map(([key, value]) => (
              <FragmentRow key={key} k={key} v={formatMappingValue(value)}/>
            ))}
          </dl>
        </div>
      )}

      {rejectedRows.length > 0 && (
        <div className="rc-upload-preview-section">
          <div className="rc-upload-preview-section-label">
            {lang === 'ko' ? '반려된 행 (최대 3개 표시)' : 'Rejected rows (showing up to 3)'}
          </div>
          <div className="rc-upload-preview-rejected">
            {rejectedRows.map((row, index) => (
              <div key={index} className="rc-upload-preview-rejected-row">
                <strong>
                  {lang === 'ko'
                    ? `행 ${row.row_number ?? index + 1} · ${row.reason_code ?? 'unknown'}`
                    : `Row ${row.row_number ?? index + 1} · ${row.reason_code ?? 'unknown'}`}
                </strong>
                {row.reason_message && <div>{row.reason_message}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function NoRevenueEmptyState({
  lang,
  selectedStore,
  onOpenUpload,
  onLoadDemoRevenue,
}: {
  lang: RcLang;
  selectedStore: RevenueStoreSummary | null;
  onOpenUpload: () => void;
  onLoadDemoRevenue: () => void;
}) {
  return (
    <section className="rc-empty-revenue-state">
      <div className="rc-empty-revenue-inner">
        <div className="rc-bootstrap-kicker">{selectedStore?.store_name ?? (lang === 'ko' ? '신규 매장' : 'New store')}</div>
        <h1>{lang === 'ko' ? '매출 데이터가 아직 등록되지 않았습니다.' : 'No revenue data has been registered yet.'}</h1>
        <p>
          {lang === 'ko'
            ? '매출 데이터를 등록하면 외부 맥락과 함께 원인 후보를 분석합니다.'
            : 'Register revenue data to analyze candidate causes alongside external context.'}
        </p>
        <div className="rc-empty-actions">
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={onOpenUpload}>
            {lang === 'ko' ? '매출 데이터 등록하기' : 'Add revenue data'}
          </button>
          <button type="button" className="rc-store-button" onClick={onLoadDemoRevenue}>
            {lang === 'ko' ? '예시 매출 데이터로 먼저 체험하기' : 'Try sample revenue data'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── main surface ─────────────────────────────────────────────────────────────

export function RevenueCockpitApp() {
  const [lang, setLangState] = useState<RcLang>(() => loadPref('rc-lang', 'ko', ['ko', 'en'] as const));
  const [theme, setThemeState] = useState<RcTheme>(() => loadPref('rc-theme', 'system', ['light', 'dark', 'system'] as const));
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => resolveTheme(theme));
  const [screen, setScreen] = useState<RcScreen>('brief');
  const [scenario, setScenario] = useState<Scenario>(() => SCENARIO);
  const [statuses, setStatuses] = useState<ActionStatuses>(() => ({ ...DEFAULT_STATUSES }));
  const [apiMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return wantsApiData() || (params.has('code') && params.has('state'));
  });
  const [apiNotice, setApiNotice] = useState<'loading' | 'fallback' | 'auth-expired' | 'patch-saving' | 'patch-saved' | 'patch-local' | 'patch-failed' | null>(() => wantsApiData() ? 'loading' : null);
  const [authReloadTick, setAuthReloadTick] = useState(0);
  const [authSession, setAuthSession] = useState<RevenueAuthSession | null>(() => getStoredAuthSession());
  const [authPopoverOpen, setAuthPopoverOpen] = useState(false);
  const [stores, setStores] = useState<RevenueStoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => loadSelectedStoreId());
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [createStoreError, setCreateStoreError] = useState<string | null>(null);
  const [showRevenueUpload, setShowRevenueUpload] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [latestPipelineMeta, setLatestPipelineMeta] = useState<Record<string, unknown> | null>(null);
  const [storeForm, setStoreForm] = useState<StoreCreateForm>({
    store_name: '',
    tenant_name: '',
    business_category: '',
    region: '',
    address_text: '',
  });

  useEffect(() => {
    const handleAuthChanged = () => {
      const session = getStoredAuthSession();
      setAuthSession(session);
      if (!getStoredCognitoToken()) {
        setStores([]);
        setSelectedStoreId(null);
        setBootstrapStatus(null);
        setLatestPipelineMeta(null);
      }
      setAuthReloadTick(tick => tick + 1);
    };

    window.addEventListener('revenue-ops-auth-changed', handleAuthChanged);
    return () => {
      window.removeEventListener('revenue-ops-auth-changed', handleAuthChanged);
    };
  }, []);

  const setLang = (l: RcLang) => { setLangState(l); savePref('rc-lang', l); };
  const setTheme = (t: RcTheme) => { setThemeState(t); savePref('rc-theme', t); setEffectiveTheme(resolveTheme(t)); };
  const setSelectedStoreId = (storeId: string | null) => {
    setSelectedStoreIdState(storeId);
    saveSelectedStoreId(storeId);
  };

  function isActionStatus(value: unknown): value is ActionStatus {
    return value === 'recommended' || value === 'selected' || value === 'planned' || value === 'done' || value === 'dismissed';
  }

  function mergeActionStatusesFromEnvelope(actionsEnvelope: { actions?: Array<{ action_id?: string; status?: unknown }> }) {
    setStatuses(prev => {
      const next = { ...prev };
      for (const action of actionsEnvelope.actions ?? []) {
        if (action.action_id && isActionStatus(action.status)) {
          next[action.action_id] = action.status;
        }
      }
      return next;
    });
  }

  const setStatus = (id: string, s: ActionStatus) => {
    setStatuses(prev => ({ ...prev, [id]: s }));
    if (!apiMode) return;

    setApiNotice('patch-saving');

    apiUpdateActionStatus(id, s, selectedStoreId ?? undefined)
      .then(async envelope => {
        if (envelope.action?.action_id && isActionStatus(envelope.action.status)) {
          setStatuses(prev => ({ ...prev, [envelope.action!.action_id!]: envelope.action!.status as ActionStatus }));
        }

        try {
          const actionsEnvelope = await apiFetchActions(selectedStoreId ?? undefined);
          mergeActionStatusesFromEnvelope(actionsEnvelope);
        } catch {
          // PATCH succeeded, but refetch failed. Keep optimistic state and show persistence result below.
        }

        setApiNotice(envelope.status_persistence === 'aurora' ? 'patch-saved' : 'patch-local');
        window.setTimeout(() => {
          setApiNotice(prev => (prev === 'patch-saved' || prev === 'patch-local' ? null : prev));
        }, 2400);
      })
      .catch(() => {
        setApiNotice('patch-failed');
      });
  };

  // Track system preference changes when theme === 'system'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') setEffectiveTheme(resolveTheme('system'));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Re-resolve when theme preference changes
  useEffect(() => {
    setEffectiveTheme(resolveTheme(theme));
  }, [theme]);

  useEffect(() => {
    if (!apiMode) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state') && authReloadTick === 0) {
      setApiNotice('loading');
      return;
    }

    let cancelled = false;
    const token = getStoredCognitoToken();
    if (!token) {
      setStores([]);
      setSelectedStoreId(null);
      setStoreNotice(lang === 'ko' ? '로그인이 만료되었습니다. 다시 로그인해주세요.' : 'Login expired. Please sign in again.');
      setApiNotice('auth-expired');
      return;
    }

    setStoreLoading(true);
    setStoreNotice(lang === 'ko' ? '가게 목록 불러오는 중' : 'Loading stores');

    apiFetchStores()
      .then(envelope => {
        if (cancelled) return;
        const nextStores = envelope.stores ?? [];
        setStores(nextStores);
        const saved = loadSelectedStoreId();
        const nextSelected = chooseInitialStore(nextStores, saved);
        setSelectedStoreId(nextSelected);
        setLatestPipelineMeta(null);
        setStoreNotice(nextStores.length === 0
          ? (lang === 'ko'
              ? '예시 데이터로 보는 중입니다. 실제 매장 분석을 시작하려면 새 가게를 등록해 주세요.'
              : 'Viewing demo data. To analyze your real shop, register a new store.')
          : null);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Revenue Cockpit store list API failed.', error);
        setStores([]);
        setSelectedStoreId(null);
        const authExpired = error instanceof RevenueApiError && error.status === 401;
        setStoreNotice(authExpired
          ? (lang === 'ko' ? '로그인이 만료되었습니다. 다시 로그인해주세요.' : 'Login expired. Please sign in again.')
          : (lang === 'ko' ? '가게 목록을 불러오지 못했습니다.' : 'Could not load stores.'));
        if (authExpired) setApiNotice('auth-expired');
      })
      .finally(() => {
        if (!cancelled) setStoreLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiMode, authReloadTick, lang]);

  function refreshCockpitDataForStore(storeId: string) {
    return Promise.all([
      apiFetchBriefs(storeId),
      apiFetchAnomalies(storeId),
      apiFetchActions(storeId),
      apiFetchContext(storeId),
      apiFetchPipelineMeta(storeId),
    ]).then(([briefsEnvelope, anomaliesEnvelope, actionsEnvelope, contextEnvelope, pipelineMetaEnvelope]) => {
      setLatestPipelineMeta(pipelineMetaEnvelope.pipeline_meta ?? null);
      const next = buildScenarioFromApi({
        briefs: briefsEnvelope.briefs,
        anomalies: anomaliesEnvelope.anomalies,
        actions: actionsEnvelope.actions,
        context: contextEnvelope.context,
        pipelineMeta: pipelineMetaEnvelope.pipeline_meta,
      });
      setScenario(next.scenario);
      setStatuses(next.defaultStatuses);
      setApiNotice(null);
      const summarized = summarizeBootstrapFromMeta(storeId, pipelineMetaEnvelope.pipeline_meta);
      if (summarized) setBootstrapStatus(summarized);
      return pipelineMetaEnvelope.pipeline_meta;
    });
  }

  function pollPipelineMetaForBootstrap(storeId: string, attempt = 0) {
    apiFetchPipelineMeta(storeId)
      .then(envelope => {
        if (storeId === selectedStoreId) setLatestPipelineMeta(envelope.pipeline_meta ?? null);
        const summarized = summarizeBootstrapFromMeta(storeId, envelope.pipeline_meta);
        if (summarized) setBootstrapStatus(summarized);
        const terminal = summarized && summarized.phase !== 'collecting';
        if (!terminal && attempt < 5) {
          window.setTimeout(() => pollPipelineMetaForBootstrap(storeId, attempt + 1), 1800);
          return;
        }
        refreshCockpitDataForStore(storeId).catch(() => undefined);
      })
      .catch(() => {
        setBootstrapStatus(prev => prev ? { ...prev, phase: 'partial', message: 'pipeline_meta_fetch_failed' } : prev);
      });
  }

  function startContextCollection(storeId: string, hint?: ContextBootstrapHint, reasonOverride?: string) {
    const reason = reasonOverride || hint?.reason || 'manual_refresh';
    setBootstrapStatus({
      storeId,
      phase: 'collecting',
      collectors: [],
      completed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
    });
    setStoreNotice(lang === 'ko' ? '맥락 수집 중...' : 'Collecting context...');
    apiCollectStoreContext(storeId, { mode: hint?.mode || 'live', reason })
      .then(envelope => {
        const summary = isRecord(envelope.summary) ? envelope.summary : {};
        const collectors = Array.isArray(summary.collectors) ? summary.collectors.filter(isRecord) as BootstrapCollector[] : [];
        const failed = Number(summary.failed_collector_count ?? collectors.filter(c => c.status === 'failed').length) || 0;
        const timedOut = Number(summary.timed_out_collector_count ?? collectors.filter(c => c.reason === 'request_timeout').length) || 0;
        setBootstrapStatus({
          storeId,
          phase: failed > 0 || timedOut > 0 ? 'partial' : 'ready',
          collectors,
          completed: Number(summary.completed_collector_count ?? collectors.filter(c => c.status === 'completed').length) || 0,
          failed,
          skipped: Number(summary.skipped_collector_count ?? collectors.filter(c => c.status === 'skipped').length) || 0,
          timedOut,
        });
          setStoreNotice(failed > 0 || timedOut > 0 ? (lang === 'ko' ? '맥락 수집 지연 · 재시도 가능' : 'Context collection delayed · retry available') : (lang === 'ko' ? '최근 맥락 갱신 완료 · 실패 0' : 'Context refreshed · 0 failures'));
        pollPipelineMetaForBootstrap(storeId);
      })
      .catch(() => {
        setBootstrapStatus(prev => prev ? { ...prev, phase: 'partial', message: 'context_collect_failed' } : prev);
        setStoreNotice(lang === 'ko' ? '맥락 수집 지연 · 재시도 가능' : 'Context collection delayed · retry available');
      });
  }

  function handleOpenAddressSearch() {
    loadPostcodeScript()
      .then(() => {
        if (!window.daum?.Postcode) throw new Error('postcode_unavailable');
        new window.daum.Postcode({
          oncomplete: data => {
            const selectedAddress = data.roadAddress || data.address || data.jibunAddress || '';
            setStoreForm(prev => ({
              ...prev,
              address_text: selectedAddress || prev.address_text,
              region: regionFromPostcode(data) || prev.region,
              postal_code: data.zonecode || prev.postal_code,
              road_address: data.roadAddress || prev.road_address,
              jibun_address: data.jibunAddress || prev.jibun_address,
              address_source: 'postcode_search',
              metadata: {
                ...((prev as { metadata?: Record<string, unknown> }).metadata ?? {}),
                address_selected: true,
              },
            }));
            setStoreNotice(lang === 'ko' ? '주소가 선택되었습니다. 상세 주소를 확인해주세요.' : 'Address selected. Check the detail address.');
          },
        }).open();
      })
      .catch(() => {
        setStoreNotice(lang === 'ko'
          ? '주소 검색을 열지 못했습니다. 도로명 주소를 직접 입력해주세요.'
          : 'Could not open address search. Enter the road-name address manually.');
      });
  }

  function buildSampleRevenueRows() {
    const rows: Array<Record<string, unknown>> = [];
    const start = Date.UTC(2026, 2, 9);
    for (let day = 0; day < 56; day += 1) {
      const date = new Date(start + day * 86400000);
      const dow = date.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const rainSoftness = day === 23 || day === 31 || day === 39 ? 0.82 : 1;
      const recovery = day >= 44 ? 1.08 : 1;
      const baseOrders = weekend ? 118 : dow === 1 ? 72 : 92;
      const orderCount = Math.max(20, Math.round((baseOrders + ((day * 11) % 17) - 8) * rainSoftness * recovery));
      const averageTicket = (weekend ? 10600 : 9200) + ((day * 137) % 900);
      const gross = Math.round(orderCount * averageTicket);
      rows.push({
        business_date: date.toISOString().slice(0, 10),
        channel: 'offline_pos',
        gross_sales_amount: gross,
        net_sales_amount: Math.round(gross * 0.965),
        order_count: orderCount,
        cancel_count: Math.round(orderCount * 0.01),
        refund_amount: Math.round(gross * 0.006),
        discount_amount: Math.round(gross * 0.029),
        payment_card_amount: Math.round(gross * 0.84),
        payment_cash_amount: Math.round(gross * 0.07),
      });
    }
    return rows;
  }

  function handleLoadDemoRevenue() {
    if (!selectedStoreId) return;
    setStoreLoading(true);
    setStoreNotice(lang === 'ko' ? '예시 매출 데이터를 등록하는 중입니다.' : 'Loading sample revenue data.');
    apiCreateRevenueUpload(selectedStoreId, {
      source_type: 'm6_sample_daily_revenue',
      original_filename: 'm6_sample_daily_revenue.json',
      daily_rows: buildSampleRevenueRows(),
      metadata: {
        is_demo: true,
        demo_scenario: 'explicit_user_selected_sample_revenue',
        generated_for: 'm6_presentation',
      },
    })
      .then(envelope => {
        setStoreNotice(lang === 'ko'
          ? `예시 매출 데이터 등록 완료 · 승인 ${envelope.upload?.accepted_count ?? envelope.accepted_count ?? 0}행`
          : `Sample revenue loaded · accepted ${envelope.upload?.accepted_count ?? envelope.accepted_count ?? 0} rows`);
        return refreshCockpitDataForStore(selectedStoreId);
      })
      .catch(() => {
        setStoreNotice(lang === 'ko' ? '예시 매출 데이터를 등록하지 못했습니다.' : 'Could not load sample revenue data.');
      })
      .finally(() => setStoreLoading(false));
  }

  useEffect(() => {
    if (!apiMode) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state') && authReloadTick === 0) {
      setApiNotice('loading');
      return;
    }

    let cancelled = false;
    const storeId = selectedStoreId ?? undefined;
    if (getStoredCognitoToken() && !storeId) {
      return;
    }

    Promise.all([
      apiFetchBriefs(storeId),
      apiFetchAnomalies(storeId),
      apiFetchActions(storeId),
      apiFetchContext(storeId),
      apiFetchPipelineMeta(storeId),
    ])
      .then(([briefsEnvelope, anomaliesEnvelope, actionsEnvelope, contextEnvelope, pipelineMetaEnvelope]) => {
        if (cancelled) return;
        const next = buildScenarioFromApi({
          briefs: briefsEnvelope.briefs,
          anomalies: anomaliesEnvelope.anomalies,
          actions: actionsEnvelope.actions,
          context: contextEnvelope.context,
          pipelineMeta: pipelineMetaEnvelope.pipeline_meta,
        });
        setLatestPipelineMeta(pipelineMetaEnvelope.pipeline_meta ?? null);
        setScenario(next.scenario);
        setStatuses(next.defaultStatuses);
        setApiNotice(null);
      })
      .catch(() => {
        if (cancelled) return;
        setScenario(SCENARIO);
        setLatestPipelineMeta(null);
        setStatuses({ ...DEFAULT_STATUSES });
        setApiNotice('fallback');
      });

    return () => { cancelled = true; };
  }, [apiMode, authReloadTick, selectedStoreId]);

  function handleArchiveSelectedStore() {
    if (!selectedStoreId) return;
    const target = stores.find((store) => store.store_id === selectedStoreId);
    if (!target) return;
    const label = target.store_name || (lang === 'ko' ? '선택된 매장' : 'this store');
    const confirmed = window.confirm(
      lang === 'ko'
        ? `${label}을(를) 보관 처리하시겠습니까? 보관된 매장은 기본 목록에서 숨겨집니다. 매출/맥락 기록은 그대로 보존됩니다.`
        : `Archive ${label}? It will be hidden from the default list. Revenue and context history is preserved.`,
    );
    if (!confirmed) return;
    setStoreLoading(true);
    apiArchiveStore(selectedStoreId)
      .then(() => {
        setStores((prev) => prev.filter((store) => store.store_id !== selectedStoreId));
        const remaining = stores.filter((store) => store.store_id !== selectedStoreId);
        const next = remaining[0]?.store_id ?? null;
        setSelectedStoreId(next);
        setLatestPipelineMeta(null);
        setStoreNotice(lang === 'ko' ? '매장이 보관되었습니다.' : 'Store archived.');
      })
      .catch(() => {
        setStoreNotice(lang === 'ko' ? '보관 처리에 실패했습니다.' : 'Could not archive the store.');
      })
      .finally(() => setStoreLoading(false));
  }

  function handleCancelCreateStore() {
    setShowCreateStore(false);
    setCreateStoreError(null);
    setStoreForm({ store_name: '', tenant_name: '', business_category: '', region: '', address_text: '' });
  }

  function handleCreateStore() {
    setCreateStoreError(null);
    if (!storeForm.store_name.trim()) {
      setCreateStoreError(lang === 'ko' ? '가게 이름을 입력해 주세요.' : 'Enter a store name.');
      return;
    }
    if (!storeForm.business_category?.trim()) {
      setCreateStoreError(lang === 'ko' ? '업종을 선택해 주세요.' : 'Please select a category.');
      return;
    }
    const addressSelected = storeForm.address_source === 'postcode_search'
      || (storeForm.metadata as Record<string, unknown> | undefined)?.address_selected === true;
    if (!storeForm.address_text?.trim() || !addressSelected) {
      setCreateStoreError(lang === 'ko'
        ? '주소 검색으로 주소를 선택해 주세요.'
        : 'Please select an address via address search.');
      return;
    }
    if (!getStoredCognitoToken()) {
      setCreateStoreError(lang === 'ko'
        ? '로그인 상태를 확인해 주세요. 다시 로그인하면 등록을 이어갈 수 있습니다.'
        : 'Please sign in again to continue creating the store.');
      return;
    }

    const baseAddress = storeForm.address_text?.trim() || '';
    const detailAddress = storeForm.detail_address?.trim() || '';
    const addressText = [baseAddress, detailAddress].filter(Boolean).join(' ') || undefined;

    setStoreLoading(true);
    setStoreNotice(lang === 'ko' ? '가게를 등록하는 중입니다.' : 'Creating store.');
    const categoryCode = storeForm.business_category?.trim() || undefined;
    const seoulCategory = findSeoulServiceCategory(categoryCode);
    apiCreateStore({
      store_name: storeForm.store_name.trim(),
      tenant_name: storeForm.tenant_name?.trim() || undefined,
      business_category: categoryCode,
      region: storeForm.region?.trim() || undefined,
      address_text: addressText,
      address_source: storeForm.address_source || 'postcode_search',
      address_selected: true,
      metadata: {
        ...(storeForm.metadata ?? {}),
        address_source: storeForm.address_source || 'postcode_search',
        address_selected: true,
        ...(storeForm.postal_code ? { postal_code: storeForm.postal_code } : {}),
        ...(storeForm.road_address ? { road_address: storeForm.road_address } : {}),
        ...(storeForm.jibun_address ? { jibun_address: storeForm.jibun_address } : {}),
        ...(storeForm.detail_address?.trim() ? { detail_address: storeForm.detail_address.trim() } : {}),
        ...(seoulCategory ? {
          business_category_label: seoulCategory.ko,
          business_category_label_en: seoulCategory.en,
          business_category_source: 'seoul_open_data',
          commercial_sales_endpoint: SEOUL_COMMERCIAL_SALES_ENDPOINT,
        } : {}),
      },
    })
      .then(envelope => {
        const created = envelope.store;
        if (!created) throw new Error('missing store');
        setStores(prev => [...prev.filter(store => store.store_id !== created.store_id), created]);
        setSelectedStoreId(created.store_id);
        setLatestPipelineMeta(null);
        setStoreForm({ store_name: '', tenant_name: '', business_category: '', region: '', address_text: '' });
        setShowCreateStore(false);
        setCreateStoreError(null);
        setShowRevenueUpload(false);
        if (envelope.context_bootstrap_hint?.recommended) {
          setStoreNotice(lang === 'ko' ? '가게 등록 완료 · 맥락 수집 중...' : 'Store created · collecting context...');
          startContextCollection(created.store_id, envelope.context_bootstrap_hint);
        } else {
          setBootstrapStatus({
            storeId: created.store_id,
            phase: 'skipped',
            collectors: [],
            completed: 0,
            failed: 0,
            skipped: 0,
            timedOut: 0,
            message: envelope.context_bootstrap_hint?.missing_prerequisites?.join(',') || 'missing_prerequisites',
          });
          setStoreNotice(lang === 'ko' ? '가게가 등록되었습니다. 주소와 업종을 보강하면 맥락 수집을 시작할 수 있습니다.' : 'Store created. Add address and category to collect context.');
        }
      })
      .catch(error => {
        // Surface a calm, specific message inside the create-store panel.
        // The top-row store notice stays clear so the brief does not look broken.
        setStoreNotice(null);
        const status = error instanceof RevenueApiError ? error.status : 0;
        if (status === 401 || status === 403) {
          setCreateStoreError(lang === 'ko'
            ? '로그인 상태를 확인해 주세요. 세션이 만료되었을 수 있습니다.'
            : 'Please check your sign-in state — your session may have expired.');
        } else if (status === 400 || status === 422) {
          setCreateStoreError(lang === 'ko'
            ? '입력값을 다시 확인해 주세요. 가게 이름, 업종, 주소(검색 선택)는 필수입니다.'
            : 'Please double-check the inputs. Store name, category, and search-selected address are required.');
        } else {
          setCreateStoreError(lang === 'ko'
            ? '등록에 실패했습니다. 입력값 또는 로그인 상태를 확인해 주세요.'
            : 'Registration failed. Please check the inputs or your sign-in state.');
        }
      })
      .finally(() => setStoreLoading(false));
  }

  function handleRetryContext() {
    if (!selectedStoreId) return;
    startContextCollection(selectedStoreId, { recommended: true, mode: 'live', reason: 'manual_refresh' }, 'manual_refresh');
  }

  function handleLogout() {
    markRevenueLogoutRedirect();
    clearStoredAuthSession();
    window.location.assign(buildCognitoLogoutUrl());
  }

  const selectedStore = stores.find(store => store.store_id === selectedStoreId) ?? null;
  const selectedStoreIsDemo = isDemoStore(selectedStore);
  const latestRevenueUpload = isRecord(latestPipelineMeta?.latest_revenue_upload)
    ? latestPipelineMeta?.latest_revenue_upload
    : null;
  const latestRevenueUploadIsDemo = isRecord(latestRevenueUpload?.metadata) && latestRevenueUpload.metadata.is_demo === true;
  const hasRevenueData = selectedStoreIsDemo || Boolean(latestRevenueUpload);
  // The empty-state card duplicates the upload panel CTAs; hide it while
  // create-store or revenue-upload panels are open.
  const noRevenueMode = Boolean(
    apiMode
    && selectedStoreId
    && !selectedStoreIsDemo
    && latestPipelineMeta
    && !hasRevenueData
    && !showCreateStore
    && !showRevenueUpload
  );
  const showDemoBadge = selectedStoreIsDemo || latestRevenueUploadIsDemo || scenario.isDemo;
  const noticeCopy = apiNotice === 'loading'
    ? (lang === 'ko' ? 'API 데이터를 확인하는 중입니다.' : 'Checking API data.')
    : apiNotice === 'fallback'
      ? (lang === 'ko' ? 'API 데이터를 불러오지 못해 데모 데이터를 표시합니다.' : 'Could not load API data. Showing demo data instead.')
      : apiNotice === 'auth-expired'
        ? (lang === 'ko' ? '로그인이 만료되었습니다. 다시 로그인해주세요.' : 'Login expired. Please sign in again.')
        : apiNotice === 'patch-saving'
        ? (lang === 'ko' ? '상태 변경을 Aurora에 저장하는 중입니다.' : 'Saving the status to Aurora.')
        : apiNotice === 'patch-saved'
          ? (lang === 'ko' ? '상태 변경이 Aurora에 저장되었습니다.' : 'Status saved to Aurora.')
          : apiNotice === 'patch-local'
            ? (lang === 'ko' ? '상태 변경은 반영됐지만 Aurora 저장 여부를 확인하지 못했습니다.' : 'Status changed, but Aurora persistence was not confirmed.')
            : apiNotice === 'patch-failed'
              ? (lang === 'ko' ? '상태 변경을 API에 저장하지 못했습니다. 화면 상태는 유지됩니다.' : 'Could not save the status to the API. The screen state is kept.')
              : null;

  const isLoggedIn = Boolean(apiMode && getStoredCognitoToken());

  return (
    <div className="rc-root" data-theme={effectiveTheme}>
      <ChromeBar
        lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
        leadSlot={
          <div className="rc-chrome-brand">
            <img className="rc-app-icon" src="/brand/revenue-os-icon-512.png" alt="Revenue OS"/>
            <span className="rc-serif rc-chrome-brand-name">
              Revenue&nbsp;<span style={{ fontStyle: 'italic', color: 'var(--rc-accent-strong)' }}>OS</span>
            </span>
            <span className="rc-chrome-brand-context">
              {buildHeaderContext(lang, scenario, selectedStore)}
            </span>
          </div>
        }
        authEmail={apiMode ? (authSession?.email ?? null) : null}
        onLogout={apiMode && authSession ? handleLogout : undefined}
        loginSlot={apiMode && !authSession ? (
          <div className="rc-auth-popover-anchor">
            <button
              type="button"
              className="rc-chrome-auth-chip-login"
              onClick={() => setAuthPopoverOpen(value => !value)}
              aria-haspopup="dialog"
              aria-expanded={authPopoverOpen}
            >
              {lang === 'ko' ? '로그인' : 'Login'}
            </button>
            {authPopoverOpen && (
              <AuthPopover
                lang={lang}
                onClose={() => setAuthPopoverOpen(false)}
                onAuthenticated={() => {
                  setAuthPopoverOpen(false);
                  // Auth-changed event from cognitoSignIn updates state and triggers reload tick.
                }}
              />
            )}
          </div>
        ) : null}
      />
      <StoreBarShell
        storeBar={isLoggedIn ? (
          <StoreSwitcher
            lang={lang}
            stores={stores}
            selectedStoreId={selectedStoreId}
            loading={storeLoading}
            notice={storeNotice}
            showCreate={showCreateStore}
            createError={createStoreError}
            form={storeForm}
            onSelectStore={storeId => {
              setSelectedStoreId(storeId);
              setLatestPipelineMeta(null);
              setShowRevenueUpload(false);
            }}
            onOpenCreate={() => {
              setShowCreateStore(true);
              setCreateStoreError(null);
            }}
            onCancelCreate={handleCancelCreateStore}
            onChangeForm={patch => setStoreForm(prev => ({ ...prev, ...patch }))}
            onCreateStore={handleCreateStore}
            onOpenAddressSearch={handleOpenAddressSearch}
            onOpenRevenueUpload={() => setShowRevenueUpload(value => !value)}
            onArchiveStore={handleArchiveSelectedStore}
            canArchive={Boolean(selectedStoreId && selectedStore && !selectedStoreIsDemo)}
            compact
          />
        ) : null}
      />
      <RcReportNavRow
        lang={lang}
        screen={screen}
        onSetScreen={setScreen}
        periodLabel={selectedStore
          ? (latestRevenueUpload?.created_at
              ? (lang === 'ko' ? '최근 업로드 기준' : 'Latest upload')
              : (lang === 'ko' ? '선택된 매장 리포트' : 'Selected store report'))
          : (lang === 'ko' ? '예시 데이터 기준 리포트' : 'Demo data report')}
      />
      {showDemoBadge && (
        <div className="rc-demo-strip">
          <span>{lang === 'ko' ? '예시 데이터' : 'Demo data'}</span>
          <span>{lang === 'ko' ? '합성 데이터이며 실제 가맹점 매출이 아닙니다.' : 'Synthetic data, not real merchant revenue.'}</span>
        </div>
      )}
      {noticeCopy && (
        <div className="rc-api-notice">
          <Icon name="shield" size={12}/>
          <span>{noticeCopy}</span>
        </div>
      )}
      {apiMode && bootstrapStatus && selectedStoreId === bootstrapStatus.storeId && (
        <OnboardingBootstrapPanel
          lang={lang}
          status={bootstrapStatus}
          onRetry={handleRetryContext}
        />
      )}
      {apiMode && selectedStoreId && showRevenueUpload && (
        <RevenueUploadPanel
          lang={lang}
          storeId={selectedStoreId}
          onClose={() => setShowRevenueUpload(false)}
          onUploaded={() => {
            void refreshCockpitDataForStore(selectedStoreId);
          }}
        />
      )}
      <div className="rc-screen">
        {noRevenueMode && screen !== 'reliability' ? (
          <NoRevenueEmptyState
            lang={lang}
            selectedStore={selectedStore}
            onOpenUpload={() => setShowRevenueUpload(true)}
            onLoadDemoRevenue={handleLoadDemoRevenue}
          />
        ) : screen === 'brief' && (
          <RevenueBriefView
            lang={lang}
            scenario={scenario}
            onNavigate={setScreen}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        )}
        {screen === 'evidence' && <CauseEvidenceView lang={lang} scenario={scenario}/>}
        {screen === 'actions' && (
          <ActionPlannerView
            lang={lang}
            scenario={scenario}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        )}
        {screen === 'reliability' && <DataReliabilityView lang={lang} scenario={scenario}/>}
      </div>
    </div>
  );
}
