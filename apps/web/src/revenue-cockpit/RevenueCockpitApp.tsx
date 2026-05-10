import { useEffect, useRef, useState } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import {
  apiCollectStoreContext,
  apiCreateStore,
  apiArchiveStore,
  apiUpdateStore,
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
import {
  loadActionCompletedAt,
  saveActionCompletedAt,
  todayIsoDate,
} from './revenueActionOutcome';
import type { ActionCompletedAtMap } from './revenueActionOutcome';
import type { RcLang, RcTheme, RcScreen, ActionStatuses, ActionStatus, Scenario, UploadedDailyRevenuePoint } from './revenueCockpitTypes';

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

// ─── header (brand + control bar + onboarding) ───────────────────────────────

interface StoreManageMenuProps {
  lang: RcLang;
  onOpenCreate?: () => void;
  onOpenEdit: () => void;
  onArchive: () => void;
}

function StoreManageMenu({ lang, onOpenCreate, onOpenEdit, onArchive }: StoreManageMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <div ref={ref} className="rc-store-manage-menu">
      <button
        type="button"
        className="rc-store-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {lang === 'ko' ? '가게 관리' : 'Manage store'}
      </button>
      {open && (
        <div className="rc-store-manage-menu-pop" role="menu">
          {onOpenCreate && (
            <button
              type="button"
              className="rc-store-manage-menu-item"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenCreate(); }}
            >
              {lang === 'ko' ? '새 가게 등록' : 'Add store'}
            </button>
          )}
          <button
            type="button"
            className="rc-store-manage-menu-item"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenEdit(); }}
          >
            {lang === 'ko' ? '가게 정보 수정' : 'Edit store info'}
          </button>
          <button
            type="button"
            className="rc-store-manage-menu-item rc-store-manage-menu-item-danger"
            role="menuitem"
            onClick={() => { setOpen(false); onArchive(); }}
          >
            {lang === 'ko' ? '가게 제거' : 'Remove store'}
          </button>
        </div>
      )}
    </div>
  );
}

interface CockpitControlsBarProps {
  lang: RcLang;
  stores: RevenueStoreSummary[];
  selectedStoreId: string | null;
  storeListLoading: boolean;
  notice: string | null;
  storeManagementError: string | null;
  onDismissStoreManagementError: () => void;
  screen: RcScreen;
  onSetScreen: (s: RcScreen) => void;
  onSelectStore: (storeId: string) => void;
  onOpenCreate: () => void;
  onOpenRevenueUpload: () => void;
  onOpenEdit: () => void;
  onArchive: () => void;
  canUpload: boolean;
  canManage: boolean;
  /** When true, header collapses to [select] [가게 관리] [매출 데이터 관리] for a real
   * authenticated store; "새 가게 등록" moves into the manage menu. When false (demo
   * or no real store yet), the existing demo-friendly buttons are shown standalone. */
  productionStoreContext: boolean;
}

function CockpitControlsBar({
  lang,
  stores,
  selectedStoreId,
  storeListLoading,
  notice,
  storeManagementError,
  onDismissStoreManagementError,
  screen,
  onSetScreen,
  onSelectStore,
  onOpenCreate,
  onOpenRevenueUpload,
  onOpenEdit,
  onArchive,
  canUpload,
  canManage,
  productionStoreContext,
}: CockpitControlsBarProps) {
  const tabs: Array<{ id: RcScreen; label: string }> = [
    { id: 'brief',       label: lang === 'ko' ? '매출 요약' : 'Revenue summary' },
    { id: 'evidence',    label: lang === 'ko' ? '원인 근거' : 'Cause evidence' },
    { id: 'actions',     label: lang === 'ko' ? '실행 계획' : 'Action plan' },
    { id: 'reliability', label: lang === 'ko' ? '데이터 상태' : 'Data status' },
  ];
  return (
    <header className="rc-cockpit-controls" aria-label={lang === 'ko' ? '매출 OS 컨트롤' : 'Revenue OS controls'}>
      <div className="rc-cockpit-controls-left">
        <select
          className="rc-store-select rc-cockpit-store-select"
          value={selectedStoreId ?? ''}
          disabled={storeListLoading || stores.length === 0}
          onChange={event => onSelectStore(event.target.value)}
          aria-label={lang === 'ko' ? '가게 선택' : 'Store'}
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
        {productionStoreContext && canManage && (
          <StoreManageMenu
            lang={lang}
            onOpenCreate={onOpenCreate}
            onOpenEdit={onOpenEdit}
            onArchive={onArchive}
          />
        )}
        {!productionStoreContext && (
          <button type="button" className="rc-store-button" onClick={onOpenCreate}>
            {lang === 'ko' ? '새 가게 등록' : 'Add store'}
          </button>
        )}
        {productionStoreContext && canUpload && (
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={onOpenRevenueUpload}>
            {lang === 'ko' ? '매출 데이터 관리' : 'Manage sales data'}
          </button>
        )}
        {!productionStoreContext && canUpload && (
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={onOpenRevenueUpload}>
            {lang === 'ko' ? '매출 데이터 등록하기' : 'Add revenue data'}
          </button>
        )}
        {storeManagementError && (
          <span className="rc-store-manage-error" role="alert">
            <span>{storeManagementError}</span>
            <button
              type="button"
              className="rc-store-manage-error-dismiss"
              aria-label={lang === 'ko' ? '오류 메시지 닫기' : 'Dismiss error'}
              onClick={onDismissStoreManagementError}
            >
              ×
            </button>
          </span>
        )}
        {notice && (
          <span className="rc-store-notice rc-cockpit-status" role="status">{notice}</span>
        )}
      </div>
      <div className="rc-cockpit-controls-right">
        <nav className="rc-report-nav" aria-label={lang === 'ko' ? '리포트 탭' : 'Report tabs'}>
          {tabs.map(it => (
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
    </header>
  );
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

interface StoreFormPanelProps {
  lang: RcLang;
  mode: 'create' | 'edit';
  loading: boolean;
  error: string | null;
  form: StoreCreateForm;
  onChangeForm: (patch: Partial<StoreCreateForm>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onOpenAddressSearch: () => void;
}

function StoreFormPanel({
  lang,
  mode,
  loading,
  error,
  form,
  onChangeForm,
  onCancel,
  onSubmit,
  onOpenAddressSearch,
}: StoreFormPanelProps) {
  const heading = mode === 'create'
    ? (lang === 'ko' ? '새 가게 등록' : 'Add store')
    : (lang === 'ko' ? '가게 정보 수정' : 'Edit store info');
  const submitLabel = mode === 'create'
    ? (lang === 'ko' ? '등록' : 'Create')
    : (lang === 'ko' ? '저장' : 'Save');
  return (
    <section
      className="rc-store-create-panel rc-store-form-panel"
      role="dialog"
      aria-label={heading}
    >
      <div className="rc-store-create-head">
        <strong>{heading}</strong>
        <button type="button" className="rc-store-create-close" onClick={onCancel}>
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
        <button type="button" className="rc-store-button rc-store-button-primary" onClick={onSubmit} disabled={loading}>
          {submitLabel}
        </button>
      </div>
      {error && (
        <div className="rc-store-create-error rc-prose">
          {error}
        </div>
      )}
    </section>
  );
}

function CockpitLoadingSkeleton({ lang }: { lang: RcLang }) {
  return (
    <section
      className="rc-cockpit-skeleton"
      role="status"
      aria-live="polite"
      aria-label={lang === 'ko' ? '가게 정보를 불러오는 중' : 'Loading store info'}
    >
      <div className="rc-cockpit-skeleton-block rc-cockpit-skeleton-block-head"/>
      <div className="rc-cockpit-skeleton-grid">
        <div className="rc-cockpit-skeleton-block"/>
        <div className="rc-cockpit-skeleton-block"/>
        <div className="rc-cockpit-skeleton-block"/>
        <div className="rc-cockpit-skeleton-block"/>
      </div>
      <span className="rc-cockpit-skeleton-text">
        {lang === 'ko' ? '가게 정보를 불러오는 중입니다…' : 'Loading store info…'}
      </span>
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
  /** Real-store-in-API-mode flag. Controls panel title/description/copy, the
   * per-row overwrite affordance, and the export card visibility. */
  productionStoreContext: boolean;
  /** Used to derive the export filename slug. */
  storeName?: string | null;
  /** Daily revenue series available on the frontend (from scenario.uploadedDailySeries),
   * used as the source for the export feature. */
  exportSeries?: UploadedDailyRevenuePoint[] | null;
}

const SAMPLE_DAILY_CSV_EN = [
  'business_date,channel,gross_sales_amount,order_count',
  '2026-05-08,offline,1250000,82',
  '2026-05-08,baemin,430000,24',
  '2026-05-09,offline,1180000,76',
].join('\n');

const SAMPLE_DAILY_CSV_KO = [
  '영업일자,판매채널,총매출,거래건수',
  '2026-05-08,오프라인,1250000,82',
  '2026-05-08,배민,430000,24',
  '2026-05-09,오프라인,1180000,76',
].join('\n');

function sampleDailyCsv(lang: RcLang): string {
  return lang === 'ko' ? SAMPLE_DAILY_CSV_KO : SAMPLE_DAILY_CSV_EN;
}

function slugifyStoreName(name: string | null | undefined, fallback: string): string {
  const base = (name ?? '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  return base || fallback;
}

function todayYyyymmdd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsvBlob(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser keeps the URL alive long enough to download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function RevenueUploadPanel({
  lang,
  storeId,
  onClose,
  onUploaded,
  productionStoreContext,
  storeName,
  exportSeries,
}: RevenueUploadPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [businessDate, setBusinessDate] = useState(today);
  const [grossSales, setGrossSales] = useState('');
  const [transactionCount, setTransactionCount] = useState('');
  const [averageTicket, setAverageTicket] = useState('');
  const [channel, setChannel] = useState('offline_pos');
  const [csvText, setCsvText] = useState('');
  const [csvFilename, setCsvFilename] = useState('');
  const [sourceType, setSourceType] = useState('generic_pos_csv');
  const [csvOverwrite, setCsvOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<RevenueUploadPreviewEnvelope | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<RevenueUploadEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleToast, setSampleToast] = useState<string | null>(null);
  const sampleToastTimer = useRef<number | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Preview is tied to the current csvText/sourceType. If either changes, the
  // existing preview is no longer accurate and is cleared.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [csvText, sourceType]);

  useEffect(() => () => {
    if (sampleToastTimer.current !== null) {
      window.clearTimeout(sampleToastTimer.current);
      sampleToastTimer.current = null;
    }
  }, []);

  const isStandardCsv = sourceType === 'generic_pos_csv';
  const showOverwriteOption = productionStoreContext && isStandardCsv;
  const showCsvGuide = isStandardCsv;

  function flashSampleToast(message: string) {
    setSampleToast(message);
    if (sampleToastTimer.current !== null) window.clearTimeout(sampleToastTimer.current);
    sampleToastTimer.current = window.setTimeout(() => {
      setSampleToast(null);
      sampleToastTimer.current = null;
    }, 3000);
  }

  function copySampleCsv() {
    const text = sampleDailyCsv(lang);
    const okMessage = lang === 'ko' ? '예시 CSV를 복사했습니다.' : 'Sample CSV copied.';
    const failMessage = lang === 'ko' ? '클립보드에 복사하지 못했습니다.' : 'Could not copy to clipboard.';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => flashSampleToast(okMessage))
        .catch(() => flashSampleToast(failMessage));
    } else {
      flashSampleToast(failMessage);
    }
  }

  function downloadSampleCsv() {
    downloadCsvBlob('revenue-os-sample-daily-sales.csv', sampleDailyCsv(lang));
    flashSampleToast(lang === 'ko' ? '예시 CSV를 다운로드했습니다.' : 'Sample CSV downloaded.');
  }

  function exportSalesData() {
    const rows = exportSeries ?? [];
    if (rows.length === 0) {
      setExportNotice(lang === 'ko' ? '내보낼 매출 데이터가 없습니다.' : 'No sales data to export.');
      return;
    }
    setExportNotice(null);
    const header = ['business_date', 'net_sales_amount', 'order_count', 'average_order_value'];
    const lines = [header.join(',')];
    for (const row of rows) {
      const orders = Number(row.order_count ?? 0);
      const aov = orders > 0 ? Math.round(Number(row.net_sales) / orders) : '';
      lines.push([
        csvEscape(row.date),
        csvEscape(Number(row.net_sales) || 0),
        csvEscape(orders > 0 ? orders : ''),
        csvEscape(aov),
      ].join(','));
    }
    const slug = slugifyStoreName(storeName ?? null, storeId);
    const filename = `revenue-os-${slug}-sales-data-${todayYyyymmdd()}.csv`;
    downloadCsvBlob(filename, lines.join('\n'));
    setExportNotice(lang === 'ko' ? `${filename} 다운로드를 시작했습니다.` : `Started download: ${filename}.`);
  }

  function finishUpload(envelope: RevenueUploadEnvelope) {
    setResult(envelope);
    setError(null);
    onUploaded();
  }

  function buildCsvPayload(): RevenueUploadPayload {
    const metadata: Record<string, unknown> = {
      upload_mode: 'csv',
      no_raw_delivery_login_credentials: true,
    };
    if (showOverwriteOption && csvOverwrite) {
      metadata.overwrite_mode = 'by_date_channel';
    }
    return {
      source_type: sourceType,
      parser_type: sourceType === 'generic_pos_csv' ? 'standard_daily_revenue_csv' : sourceType,
      original_filename: csvFilename || `${sourceType}.csv`,
      file_type: 'csv',
      csv_text: csvText,
      metadata,
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

    const manualMetadata: Record<string, unknown> = {
      input_mode: 'manual_daily',
      average_ticket: averageTicket ? Number(averageTicket) : null,
    };
    // In production mode, direct daily input means "save my number for this date" —
    // so we always supersede any prior fact for the same (date, channel).
    if (productionStoreContext) {
      manualMetadata.overwrite_mode = 'by_date_channel';
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
      metadata: manualMetadata,
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

  const panelKicker = productionStoreContext
    ? (lang === 'ko' ? '매출 데이터 관리' : 'Manage sales data')
    : (lang === 'ko' ? '매출 데이터 등록' : 'Revenue data upload');
  const panelTitle = productionStoreContext
    ? (lang === 'ko' ? '매출 데이터 관리' : 'Manage sales data')
    : (lang === 'ko' ? '매출 데이터 등록' : 'Add revenue data');
  const panelDescription = productionStoreContext
    ? (lang === 'ko'
        ? 'POS에서 내려받은 CSV를 업로드하거나, 일별 매출을 직접 입력·수정할 수 있습니다.'
        : 'Upload POS CSV files, or directly enter and update daily sales.')
    : (lang === 'ko'
        ? 'POS에서 내려받은 CSV를 업로드하거나, 테스트용 일별 매출을 직접 입력할 수 있습니다.'
        : 'Upload a POS CSV or enter a test daily sales row manually.');
  return (
    <section className="rc-revenue-upload-panel" aria-label={panelTitle}>
      <div className="rc-revenue-upload-head">
        <div>
          <div className="rc-bootstrap-kicker">{panelKicker}</div>
          <strong>{panelTitle}</strong>
          <p>{panelDescription}</p>
          {productionStoreContext ? (
            <p>
              {lang === 'ko'
                ? '같은 날짜와 채널의 데이터는 덮어쓸 수 있습니다.'
                : 'Rows with the same date and channel can be overwritten.'}
            </p>
          ) : (
            <p>
              {lang === 'ko'
                ? '매출 데이터가 등록되면 원인 후보와 실행 액션이 갱신됩니다.'
                : 'Cause candidates and action suggestions refresh after revenue data is registered.'}
            </p>
          )}
        </div>
        <button type="button" className="rc-store-button" onClick={onClose}>
          {lang === 'ko' ? '닫기' : 'Close'}
        </button>
      </div>

      <div className="rc-revenue-upload-grid">
        <div className="rc-card rc-revenue-upload-card rc-revenue-upload-card-csv">
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
            <label className="rc-csv-file-picker" htmlFor="rc-csv-file-input">
              <span className="rc-store-button rc-csv-file-button">
                {lang === 'ko' ? '파일 선택' : 'Choose file'}
              </span>
              <span className="rc-csv-file-name">
                {csvFilename || (lang === 'ko' ? '선택된 파일 없음' : 'No file chosen')}
              </span>
              <input
                id="rc-csv-file-input"
                className="rc-visually-hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={event => onFileSelected(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {showCsvGuide && (
            <details className="rc-csv-guide" open>
              <summary>{lang === 'ko' ? '표준 일별 매출 CSV 작성 방법' : 'How to prepare the standard daily sales CSV'}</summary>
              <p className="rc-csv-guide-intro">
                {lang === 'ko'
                  ? '엑셀이나 구글시트에서 아래 형식으로 작성한 뒤 CSV로 저장해 업로드할 수 있습니다. 첫 줄은 반드시 항목명으로 두고, 금액에는 쉼표나 원 표시를 넣지 마세요. 한국어 항목명도 사용할 수 있습니다.'
                  : 'You can prepare this in Excel or Google Sheets and save it as CSV. Keep the first row as the header, and enter amounts as plain numbers without commas or currency symbols.'}
              </p>
              <table className="rc-csv-guide-table">
                <tbody>
                  <tr>
                    <th>{lang === 'ko' ? '영업일자' : 'business_date'}</th>
                    <td>{lang === 'ko' ? '영업일자입니다. 예: 2026-05-08' : 'Business date. Example: 2026-05-08'}</td>
                  </tr>
                  <tr>
                    <th>{lang === 'ko' ? '판매채널' : 'channel'}</th>
                    <td>{lang === 'ko' ? '판매 채널입니다. 예: 오프라인, 배민, 쿠팡이츠, 네이버' : 'Sales channel. Example: offline, baemin, coupangeats, naver'}</td>
                  </tr>
                  <tr>
                    <th>{lang === 'ko' ? '총매출' : 'gross_sales_amount'}</th>
                    <td>{lang === 'ko' ? '해당 날짜/채널의 총매출입니다. 예: 1250000' : 'Gross sales amount. Example: 1250000'}</td>
                  </tr>
                  <tr>
                    <th>{lang === 'ko' ? '거래건수' : 'order_count'}</th>
                    <td>{lang === 'ko' ? '거래 또는 주문 건수입니다. 예: 82' : 'Number of orders/transactions. Example: 82'}</td>
                  </tr>
                </tbody>
              </table>
              <div className="rc-csv-guide-actions">
                <button type="button" className="rc-store-button" onClick={copySampleCsv}>
                  {lang === 'ko' ? '예시 CSV 복사' : 'Copy sample CSV'}
                </button>
                <button type="button" className="rc-store-button" onClick={downloadSampleCsv}>
                  {lang === 'ko' ? '예시 CSV 다운로드' : 'Download sample CSV'}
                </button>
                {sampleToast && <span className="rc-csv-guide-toast" role="status">{sampleToast}</span>}
              </div>
              <p className="rc-csv-guide-tip">
                {lang === 'ko'
                  ? '날짜는 YYYY-MM-DD 형식으로 입력하세요. 금액은 1250000처럼 숫자만 입력하세요. 같은 날짜와 채널의 데이터는 덮어쓸 수 있습니다.'
                  : 'Use YYYY-MM-DD for dates. Enter amounts as plain numbers like 1250000. Rows with the same date and channel can be overwritten.'}
              </p>
            </details>
          )}
          {showOverwriteOption && (
            <label className="rc-csv-overwrite">
              <input
                type="checkbox"
                checked={csvOverwrite}
                onChange={event => setCsvOverwrite(event.target.checked)}
              />
              <span>{lang === 'ko' ? '같은 날짜/채널 데이터 덮어쓰기' : 'Overwrite same date/channel rows'}</span>
            </label>
          )}
          <textarea
            className="rc-revenue-csv"
            value={csvText}
            placeholder={sampleDailyCsv(lang)}
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

        <div className="rc-revenue-upload-right-col">
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
              {productionStoreContext
                ? (lang === 'ko' ? '일별 매출 저장' : 'Save daily sales')
                : (lang === 'ko' ? '일별 매출 등록' : 'Add daily row')}
            </button>
            {productionStoreContext && (
              <p className="rc-upload-helper">
                {lang === 'ko'
                  ? '기존 데이터가 있으면 덮어씁니다.'
                  : 'Existing data for the same date/source will be overwritten.'}
              </p>
            )}
          </div>

          {productionStoreContext && (
            <div className="rc-card rc-revenue-upload-card rc-revenue-export-card">
              <h2>{lang === 'ko' ? '매출 데이터 내보내기' : 'Export sales data'}</h2>
              <p className="rc-upload-note">
                {lang === 'ko'
                  ? '현재 선택된 매장의 매출 데이터를 CSV로 내려받습니다.'
                  : 'Download the current store’s sales data as a CSV file.'}
              </p>
              <div className="rc-revenue-upload-actions">
                <button
                  type="button"
                  className="rc-store-button"
                  onClick={exportSalesData}
                  disabled={!exportSeries || exportSeries.length === 0}
                >
                  {lang === 'ko' ? '매출 데이터 내보내기' : 'Export sales data'}
                </button>
                {(!exportSeries || exportSeries.length === 0) && (
                  <span className="rc-upload-helper">
                    {lang === 'ko' ? '내보낼 매출 데이터가 없습니다.' : 'No sales data to export.'}
                  </span>
                )}
              </div>
              {exportNotice && <p className="rc-upload-helper">{exportNotice}</p>}
            </div>
          )}
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
  const [actionCompletedAt, setActionCompletedAt] = useState<ActionCompletedAtMap>({});
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
  // Scoped error for store-management actions (e.g. archive failures). Rendered next
  // to the 가게 관리 control rather than in the global status slot near the tabs.
  const [storeManagementError, setStoreManagementError] = useState<string | null>(null);
  const storeManagementErrorTimer = useRef<number | null>(null);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [createStoreError, setCreateStoreError] = useState<string | null>(null);
  const [showEditStore, setShowEditStore] = useState(false);
  const [editStoreError, setEditStoreError] = useState<string | null>(null);
  // Address-search target: which form (create vs. edit) should receive a picked address.
  const [addressTarget, setAddressTarget] = useState<'create' | 'edit'>('create');
  const [showRevenueUpload, setShowRevenueUpload] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [latestPipelineMeta, setLatestPipelineMeta] = useState<Record<string, unknown> | null>(null);
  // Initial-load gate. While true, the screen body shows a loading skeleton instead of
  // demo fallback / 가게 미등록 — so refresh does not flicker through those states.
  const [storesFirstLoadComplete, setStoresFirstLoadComplete] = useState(() => !wantsApiData());
  const [storeForm, setStoreForm] = useState<StoreCreateForm>({
    store_name: '',
    tenant_name: '',
    business_category: '',
    region: '',
    address_text: '',
  });
  const [storeEditForm, setStoreEditForm] = useState<StoreCreateForm>({
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

  // Clear the store-management error auto-dismiss timer on unmount.
  useEffect(() => () => {
    if (storeManagementErrorTimer.current !== null) {
      window.clearTimeout(storeManagementErrorTimer.current);
      storeManagementErrorTimer.current = null;
    }
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

  const setActionCompletedDate = (id: string, isoDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;
    setActionCompletedAt(prev => {
      const next = { ...prev, [id]: isoDate };
      saveActionCompletedAt(selectedStoreId, next);
      return next;
    });
  };

  const setStatus = (id: string, s: ActionStatus) => {
    setStatuses(prev => ({ ...prev, [id]: s }));
    setActionCompletedAt(prev => {
      // Stamp completion the first time an action becomes "done" so the
      // outcome window can anchor on a stable date. Existing stamps are
      // preserved (re-marking does not reset the window).
      if (s === 'done' && !prev[id]) {
        const next = { ...prev, [id]: todayIsoDate() };
        saveActionCompletedAt(selectedStoreId, next);
        return next;
      }
      return prev;
    });
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

  // Load the per-store action completion stamps when the selected store
  // changes so outcome tracking restores after a refresh / store switch.
  useEffect(() => {
    setActionCompletedAt(loadActionCompletedAt(selectedStoreId));
  }, [selectedStoreId]);

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
      // No token means unauthenticated, not expired.
      // Keep the header login affordance, but do not show the session-expired banner.
      setStores([]);
      setSelectedStoreId(null);
      setStoreNotice(null);
      setApiNotice(null);
      setStoresFirstLoadComplete(true);
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
        // Only clear persisted id when there are no real stores. While a saved id was
        // chosen, keep it persisted so subsequent refreshes restore the same store.
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
        const authExpired = error instanceof RevenueApiError && error.status === 401 && Boolean(getStoredCognitoToken());
        if (authExpired) {
          markAuthExpired();
        } else {
          setStores([]);
          setSelectedStoreId(null);
          setStoreNotice(lang === 'ko' ? '가게 목록을 불러오지 못했습니다.' : 'Could not load stores.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStoreLoading(false);
          setStoresFirstLoadComplete(true);
        }
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
            const setter = addressTarget === 'edit' ? setStoreEditForm : setStoreForm;
            setter(prev => ({
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
      .catch((error) => {
        if (cancelled) return;
        // Distinguish 401/Unauthorized from generic API errors so the user
        // sees a re-login affordance instead of a misleading "demo fallback".
        const authExpired = error instanceof RevenueApiError && error.status === 401 && Boolean(getStoredCognitoToken());
        if (authExpired) {
          markAuthExpired();
        } else {
          setScenario(SCENARIO);
          setLatestPipelineMeta(null);
          setStatuses({ ...DEFAULT_STATUSES });
          setApiNotice('fallback');
        }
      });

    return () => { cancelled = true; };
  }, [apiMode, authReloadTick, selectedStoreId]);

  // Centralized 401 handler: clear stale Cognito tokens, drop scenario back
  // to demo placeholder, and surface the global auth-expired banner so the
  // user can re-login from any tab. The chrome-bar login button reappears
  // because `authSession` is now null.
  function markAuthExpired() {
    clearStoredAuthSession();
    setAuthSession(null);
    setStores([]);
    setSelectedStoreId(null);
    setLatestPipelineMeta(null);
    setScenario(SCENARIO);
    setStatuses({ ...DEFAULT_STATUSES });
    setApiNotice('auth-expired');
    setStoresFirstLoadComplete(true);
  }

  function clearStoreManagementErrorTimer() {
    if (storeManagementErrorTimer.current !== null) {
      window.clearTimeout(storeManagementErrorTimer.current);
      storeManagementErrorTimer.current = null;
    }
  }

  function dismissStoreManagementError() {
    clearStoreManagementErrorTimer();
    setStoreManagementError(null);
  }

  function handleArchiveSelectedStore() {
    if (!selectedStoreId) return;
    const target = stores.find((store) => store.store_id === selectedStoreId);
    if (!target) return;
    // The backend archive (DELETE /stores/:id) hides the store from the default list
    // but retains existing revenue/context records — this is not a hard delete.
    const confirmed = window.confirm(
      lang === 'ko'
        ? '이 가게를 목록에서 제거할까요? 기존 매출 데이터와 분석 기록은 보관됩니다.'
        : 'Remove this store from the list? Revenue data and analysis history are kept.',
    );
    if (!confirmed) return;
    setStoreLoading(true);
    setShowEditStore(false);
    dismissStoreManagementError();
    apiArchiveStore(selectedStoreId)
      .then(() => {
        const remaining = stores.filter((store) => store.store_id !== selectedStoreId);
        setStores(remaining);
        const next = chooseInitialStore(remaining, null);
        setSelectedStoreId(next);
        setLatestPipelineMeta(null);
        setStoreNotice(lang === 'ko' ? '가게를 목록에서 제거했습니다.' : 'Store removed from the list.');
      })
      .catch(() => {
        setStoreManagementError(lang === 'ko' ? '가게 제거에 실패했습니다.' : 'Could not remove the store.');
        clearStoreManagementErrorTimer();
        storeManagementErrorTimer.current = window.setTimeout(() => {
          setStoreManagementError(null);
          storeManagementErrorTimer.current = null;
        }, 6000);
      })
      .finally(() => setStoreLoading(false));
  }

  function handleCancelCreateStore() {
    setShowCreateStore(false);
    setCreateStoreError(null);
    setStoreForm({ store_name: '', tenant_name: '', business_category: '', region: '', address_text: '' });
  }

  function buildEditFormFromStore(store: RevenueStoreSummary): StoreCreateForm {
    const meta = (store.metadata ?? {}) as Record<string, unknown>;
    const detailAddress = typeof meta.detail_address === 'string' ? meta.detail_address : '';
    const addressSource = typeof meta.address_source === 'string' ? meta.address_source : 'postcode_search';
    const postalCode = typeof meta.postal_code === 'string' ? meta.postal_code : '';
    const roadAddress = typeof meta.road_address === 'string' ? meta.road_address : '';
    const jibunAddress = typeof meta.jibun_address === 'string' ? meta.jibun_address : '';
    return {
      store_name: store.store_name ?? '',
      tenant_name: store.tenant_name ?? '',
      business_category: store.business_category ?? '',
      region: store.region ?? '',
      address_text: store.address_text ?? '',
      address_source: addressSource,
      detail_address: detailAddress,
      postal_code: postalCode,
      road_address: roadAddress,
      jibun_address: jibunAddress,
      metadata: { ...meta, address_selected: true },
    };
  }

  function handleOpenEditStore() {
    if (!selectedStoreId) return;
    const target = stores.find(store => store.store_id === selectedStoreId);
    if (!target) return;
    setStoreEditForm(buildEditFormFromStore(target));
    setEditStoreError(null);
    setShowEditStore(true);
    setShowCreateStore(false);
    setShowRevenueUpload(false);
  }

  function handleCancelEditStore() {
    setShowEditStore(false);
    setEditStoreError(null);
  }

  function handleSubmitEditStore() {
    if (!selectedStoreId) return;
    setEditStoreError(null);
    if (!storeEditForm.store_name.trim()) {
      setEditStoreError(lang === 'ko' ? '가게 이름을 입력해 주세요.' : 'Enter a store name.');
      return;
    }
    if (!storeEditForm.business_category?.trim()) {
      setEditStoreError(lang === 'ko' ? '업종을 선택해 주세요.' : 'Please select a category.');
      return;
    }
    const baseAddress = storeEditForm.address_text?.trim() || '';
    const detailAddress = storeEditForm.detail_address?.trim() || '';
    const addressTextNext = [baseAddress, detailAddress].filter(Boolean).join(' ') || undefined;
    const addressSelected = storeEditForm.address_source === 'postcode_search'
      || (storeEditForm.metadata as Record<string, unknown> | undefined)?.address_selected === true;
    if (!baseAddress || !addressSelected) {
      setEditStoreError(lang === 'ko'
        ? '주소 검색으로 주소를 선택해 주세요.'
        : 'Please select an address via address search.');
      return;
    }
    const categoryCode = storeEditForm.business_category?.trim();
    const seoulCategory = findSeoulServiceCategory(categoryCode);
    const baseMeta = { ...(storeEditForm.metadata ?? {}) } as Record<string, unknown>;
    if (storeEditForm.postal_code) baseMeta.postal_code = storeEditForm.postal_code;
    if (storeEditForm.road_address) baseMeta.road_address = storeEditForm.road_address;
    if (storeEditForm.jibun_address) baseMeta.jibun_address = storeEditForm.jibun_address;
    if (detailAddress) baseMeta.detail_address = detailAddress;
    else delete baseMeta.detail_address;
    baseMeta.address_source = storeEditForm.address_source || 'postcode_search';
    baseMeta.address_selected = true;
    if (seoulCategory) {
      baseMeta.business_category_label = seoulCategory.ko;
      baseMeta.business_category_label_en = seoulCategory.en;
      baseMeta.business_category_source = 'seoul_open_data';
      baseMeta.commercial_sales_endpoint = SEOUL_COMMERCIAL_SALES_ENDPOINT;
    }

    setStoreLoading(true);
    setStoreNotice(lang === 'ko' ? '가게 정보를 저장하는 중입니다.' : 'Saving store info.');
    apiUpdateStore(selectedStoreId, {
      store_name: storeEditForm.store_name.trim(),
      tenant_name: storeEditForm.tenant_name?.trim() || undefined,
      business_category: categoryCode,
      region: storeEditForm.region?.trim() || undefined,
      address_text: addressTextNext,
      address_source: storeEditForm.address_source || 'postcode_search',
      address_selected: true,
      metadata: baseMeta,
    })
      .then(envelope => {
        const updated = envelope.store;
        if (!updated) throw new Error('missing store');
        setStores(prev => prev.map(store => store.store_id === updated.store_id ? updated : store));
        setShowEditStore(false);
        setEditStoreError(null);
        setStoreNotice(lang === 'ko' ? '가게 정보가 저장되었습니다.' : 'Store info saved.');
      })
      .catch(error => {
        const status = error instanceof RevenueApiError ? error.status : 0;
        if (status === 400 || status === 422) {
          setEditStoreError(lang === 'ko'
            ? '입력값을 다시 확인해 주세요. 주소는 주소 검색으로 선택해야 합니다.'
            : 'Please double-check the inputs. Address must be selected via search.');
        } else if (status === 401 || status === 403) {
          setEditStoreError(lang === 'ko'
            ? '권한이 없거나 세션이 만료되었습니다. 다시 로그인해 주세요.'
            : 'Permission denied or session expired. Please sign in again.');
        } else {
          setEditStoreError(lang === 'ko'
            ? '가게 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'
            : 'Could not save store info. Please retry shortly.');
        }
      })
      .finally(() => setStoreLoading(false));
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
  // Production-store context: a real authenticated session viewing a real (non-demo)
  // store. In this state the header collapses to [select] [가게 관리] [매출 데이터 관리]
  // and "새 가게 등록" moves into the manage menu. Demo / not-yet-onboarded users keep
  // the existing demo-friendly standalone buttons.
  const productionStoreContext = isLoggedIn && Boolean(selectedStoreId) && !selectedStoreIsDemo;
  // While the initial store list (and the first cockpit data fetch) is still
  // resolving for an authenticated user, skip rendering demo/no-store screens
  // so refresh does not flicker through them. apiNotice starts as 'loading'
  // for apiMode and becomes null after the cockpit data fetch settles.
  const showInitialSkeleton = isLoggedIn && (
    !storesFirstLoadComplete
    || apiNotice === 'loading'
  );

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
      {isLoggedIn && (
        <CockpitControlsBar
          lang={lang}
          stores={stores}
          selectedStoreId={selectedStoreId}
          storeListLoading={storeLoading}
          notice={storeNotice}
          storeManagementError={storeManagementError}
          onDismissStoreManagementError={dismissStoreManagementError}
          screen={screen}
          onSetScreen={setScreen}
          onSelectStore={storeId => {
            setSelectedStoreId(storeId);
            setLatestPipelineMeta(null);
            setShowRevenueUpload(false);
            setShowEditStore(false);
          }}
          onOpenCreate={() => {
            setShowCreateStore(true);
            setShowEditStore(false);
            setCreateStoreError(null);
            setAddressTarget('create');
          }}
          onOpenRevenueUpload={() => setShowRevenueUpload(value => !value)}
          onOpenEdit={() => {
            setAddressTarget('edit');
            handleOpenEditStore();
          }}
          onArchive={handleArchiveSelectedStore}
          canUpload={Boolean(selectedStoreId)}
          canManage={Boolean(selectedStoreId && selectedStore && !selectedStoreIsDemo)}
          productionStoreContext={productionStoreContext}
        />
      )}
      {isLoggedIn && showCreateStore && (
        <StoreFormPanel
          lang={lang}
          mode="create"
          loading={storeLoading}
          error={createStoreError}
          form={storeForm}
          onChangeForm={patch => setStoreForm(prev => ({ ...prev, ...patch }))}
          onCancel={handleCancelCreateStore}
          onSubmit={handleCreateStore}
          onOpenAddressSearch={() => { setAddressTarget('create'); handleOpenAddressSearch(); }}
        />
      )}
      {isLoggedIn && showEditStore && selectedStoreId && (
        <StoreFormPanel
          lang={lang}
          mode="edit"
          loading={storeLoading}
          error={editStoreError}
          form={storeEditForm}
          onChangeForm={patch => setStoreEditForm(prev => ({ ...prev, ...patch }))}
          onCancel={handleCancelEditStore}
          onSubmit={handleSubmitEditStore}
          onOpenAddressSearch={() => { setAddressTarget('edit'); handleOpenAddressSearch(); }}
        />
      )}
      {showDemoBadge && !showInitialSkeleton && (
        <div className="rc-demo-strip">
          <span>{lang === 'ko' ? '예시 데이터' : 'Demo data'}</span>
          <span>{lang === 'ko' ? '합성 데이터이며 실제 가맹점 매출이 아닙니다.' : 'Synthetic data, not real merchant revenue.'}</span>
        </div>
      )}
      {/* Persistent session-expired banner — shown across all cockpit tabs
          when the API returns 401. Re-login button reuses the same auth
          popover the chrome bar exposes; logout clears any stale state. */}
      {apiNotice === 'auth-expired' && !showInitialSkeleton && (
        <div className="rc-api-notice" role="alert" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Icon name="shield" size={12}/>
          <span style={{ flex: 1, minWidth: 200 }}>
            {lang === 'ko'
              ? '세션이 만료되었습니다. 다시 로그인해 주세요.'
              : 'Your session has expired. Please sign in again.'}
          </span>
          <button
            type="button"
            className="rc-store-button rc-store-button-primary"
            onClick={() => {
              setApiNotice(null);
              setAuthPopoverOpen(true);
            }}
          >
            {lang === 'ko' ? '다시 로그인' : 'Sign in again'}
          </button>
          <button
            type="button"
            className="rc-store-button"
            onClick={handleLogout}
          >
            {lang === 'ko' ? '로그아웃' : 'Log out'}
          </button>
        </div>
      )}
      {noticeCopy && apiNotice !== 'auth-expired' && !showInitialSkeleton && (
        <div className="rc-api-notice">
          <Icon name="shield" size={12}/>
          <span>{noticeCopy}</span>
        </div>
      )}
      {apiMode && bootstrapStatus && selectedStoreId === bootstrapStatus.storeId && !showInitialSkeleton && (
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
          productionStoreContext={productionStoreContext}
          storeName={selectedStore?.store_name ?? null}
          exportSeries={scenario.uploadedDailySeries ?? null}
        />
      )}
      <div className="rc-screen">
        {showInitialSkeleton ? (
          <CockpitLoadingSkeleton lang={lang}/>
        ) : noRevenueMode && screen !== 'reliability' ? (
          <NoRevenueEmptyState
            lang={lang}
            selectedStore={selectedStore}
            onOpenUpload={() => setShowRevenueUpload(true)}
            onLoadDemoRevenue={handleLoadDemoRevenue}
          />
        ) : screen === 'brief' ? (
          <RevenueBriefView
            lang={lang}
            scenario={scenario}
            onNavigate={setScreen}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        ) : null}
        {!showInitialSkeleton && screen === 'evidence' && <CauseEvidenceView lang={lang} scenario={scenario}/>}
        {!showInitialSkeleton && screen === 'actions' && (
          <ActionPlannerView
            lang={lang}
            scenario={scenario}
            statuses={statuses}
            onSetStatus={setStatus}
            actionCompletedAt={actionCompletedAt}
            onSetCompletedDate={setActionCompletedDate}
          />
        )}
        {!showInitialSkeleton && screen === 'reliability' && <DataReliabilityView lang={lang} scenario={scenario}/>}
      </div>
    </div>
  );
}
