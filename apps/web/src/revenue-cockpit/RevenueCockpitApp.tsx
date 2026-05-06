import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import {
  apiCollectStoreContext,
  apiCreateStore,
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
  type RevenueStoreSummary,
} from './revenueCockpitApi';
import { getStoredCognitoToken } from './revenueCockpitAuth';
import { buildScenarioFromApi, wantsApiData } from './revenueCockpitData';
import { Icon, ChromeBar } from './revenueCockpitShared';
import { RevenueBriefView } from './RevenueBriefView';
import { CauseEvidenceView } from './CauseEvidenceView';
import { ActionPlannerView } from './ActionPlannerView';
import { DataReliabilityView } from './DataReliabilityView';
import type { RcLang, RcTheme, RcScreen, ActionStatuses, ActionStatus, Scenario } from './revenueCockpitTypes';

// ─── persistence helpers ──────────────────────────────────────────────────────

const SELECTED_STORE_KEY = 'revenue_ops_selected_store_id';

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

function resolveTheme(theme: RcTheme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

// ─── header (brand + tab nav) ─────────────────────────────────────────────────

interface HeaderProps {
  lang: RcLang;
  scenario: Scenario;
  screen: RcScreen;
  onSetScreen: (s: RcScreen) => void;
  storeSwitcher?: ReactNode;
}

function RcHeader({ lang, scenario, screen, onSetScreen, storeSwitcher }: HeaderProps) {
  const items: Array<{ id: RcScreen; label: string }> = [
    { id: 'brief',       label: tr('navBrief', lang) },
    { id: 'evidence',    label: tr('navEvidence', lang) },
    { id: 'actions',     label: tr('navActions', lang) },
    { id: 'reliability', label: tr('navReliability', lang) },
  ];
  return (
    <header className="rc-header" style={{
      display: 'flex', alignItems: 'flex-end', gap: 24,
      padding: '12px 32px 0',
      borderBottom: '1px solid var(--rc-rule)',
      background: 'var(--rc-surface-0)',
      flexShrink: 0,
    }}>
      <div className="rc-header-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, background: 'var(--rc-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          <Icon name="flag" size={13}/>
        </div>
        <span className="rc-serif" style={{ fontSize: 16, letterSpacing: '-0.01em', color: 'var(--rc-fg-strong)' }}>
          Revenue&nbsp;<span style={{ fontStyle: 'italic', color: 'var(--rc-accent-strong)' }}>OS</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--rc-fg-dim)', borderLeft: '1px solid var(--rc-rule)', paddingLeft: 10, marginLeft: 4 }}>
          {scenario.area[lang]} · {scenario.category[lang]} · {scenario.compare[lang]}
        </span>
        {storeSwitcher}
      </div>
      <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        {items.map(it => (
          <button key={it.id} onClick={() => onSetScreen(it.id)} style={{
            all: 'unset', cursor: 'pointer', padding: '8px 14px',
            fontSize: 12.5, fontWeight: 500,
            color: screen === it.id ? 'var(--rc-fg-strong)' : 'var(--rc-fg-muted)',
            borderBottom: screen === it.id ? '2px solid var(--rc-accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{it.label}</button>
        ))}
      </nav>
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
  form: CreateRevenueStorePayload;
  onSelectStore: (storeId: string) => void;
  onToggleCreate: () => void;
  onChangeForm: (patch: Partial<CreateRevenueStorePayload>) => void;
  onCreateStore: () => void;
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
  { key: 'registered', names: [], ko: '가게 등록 완료', en: 'Store registered' },
  { key: 'location', names: ['kakao_geocoding'], ko: '위치 맥락 수집 중', en: 'Collecting location context' },
  { key: 'weather', names: ['kma_weather'], ko: '날씨 맥락 수집 중', en: 'Collecting weather context' },
  {
    key: 'commerce',
    names: ['seoul_commercial_benchmark', 'seoul_foot_traffic_proxy', 'seoul_store_density_proxy'],
    ko: '주변 상권 맥락 수집 중',
    en: 'Collecting trade-area context',
  },
  {
    key: 'search',
    names: ['naver_local_competitor_search', 'naver_search_trend', 'korean_holiday_calendar'],
    ko: '검색/공휴일 맥락 수집 중',
    en: 'Collecting search and holiday context',
  },
  { key: 'ready', names: [], ko: '초기 분석 준비 완료', en: 'Initial analysis ready' },
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

function collectorGroupState(status: BootstrapStatus | null, names: string[]): 'done' | 'partial' | 'pending' {
  if (!status) return 'pending';
  if (names.length === 0) return status.phase === 'collecting' ? 'pending' : 'done';
  const matching = status.collectors.filter(collector => names.includes(String(collector.name ?? '')));
  if (matching.length === 0) return 'pending';
  if (matching.some(collector => collector.status === 'completed')) return 'done';
  if (matching.some(collector => collector.status === 'failed')) return 'partial';
  if (matching.every(collector => collector.status === 'skipped')) return 'partial';
  return 'pending';
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
  const partial = status.phase === 'partial' || status.phase === 'failed';
  return (
    <section className="rc-bootstrap-panel" aria-label={lang === 'ko' ? '초기 맥락 수집 상태' : 'Bootstrap status'}>
      <div className="rc-bootstrap-head">
        <div>
          <div className="rc-bootstrap-kicker">{lang === 'ko' ? '온보딩 맥락 수집' : 'Onboarding context collection'}</div>
          <strong>{partial
            ? (lang === 'ko' ? '일부 맥락데이터 수집이 지연되었습니다.' : 'Some context collection is delayed.')
            : (lang === 'ko' ? '초기 맥락데이터를 수집하고 있습니다.' : 'Collecting initial context data.')}</strong>
          <p>{partial
            ? (lang === 'ko' ? '현재 수집된 데이터만으로 초기 분석을 시작할 수 있습니다. 추가 확인이 필요합니다.' : 'The current data is enough to start. Additional confirmation is needed.')
            : (lang === 'ko' ? '함께 관측된 신호를 준비하고 있으며, 인과가 확정된 것은 아닙니다.' : 'Preparing observed-together signals; this does not prove causality.')}</p>
        </div>
        <button type="button" className="rc-store-button" onClick={onRetry}>
          {lang === 'ko' ? '맥락데이터 다시 수집' : 'Collect context again'}
        </button>
      </div>
      <div className="rc-bootstrap-steps">
        {BOOTSTRAP_GROUPS.map(group => {
          const state = group.key === 'registered'
            ? 'done'
            : group.key === 'ready'
              ? (status.phase === 'ready' || status.phase === 'partial' ? 'done' : 'pending')
              : collectorGroupState(status, group.names);
          return (
            <div key={group.key} className={`rc-bootstrap-step rc-bootstrap-step-${state}`}>
              <Icon name={state === 'done' ? 'check' : state === 'partial' ? 'shield' : 'dot'} size={12}/>
              <span>{lang === 'ko' ? group.ko : group.en}</span>
            </div>
          );
        })}
      </div>
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
  form,
  onSelectStore,
  onToggleCreate,
  onChangeForm,
  onCreateStore,
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
            <option value="">{lang === 'ko' ? '등록된 가게 없음' : 'No stores'}</option>
          )}
          {stores.map(store => (
            <option key={store.store_id} value={store.store_id}>
              {formatStoreOption(store)}
            </option>
          ))}
        </select>
        <button type="button" className="rc-store-button" onClick={onToggleCreate}>
          {lang === 'ko' ? '새 가게 등록' : 'Add store'}
        </button>
        {notice && <span className="rc-store-notice">{notice}</span>}
      </div>
      {(showCreate || stores.length === 0) && (
        <div className="rc-store-create">
          <input
            className="rc-store-input"
            value={form.store_name}
            placeholder={lang === 'ko' ? '가게 이름' : 'Store name'}
            onChange={event => onChangeForm({ store_name: event.target.value })}
          />
          <input
            className="rc-store-input"
            value={form.tenant_name ?? ''}
            placeholder={lang === 'ko' ? '테넌트 이름' : 'Tenant name'}
            onChange={event => onChangeForm({ tenant_name: event.target.value })}
          />
          <input
            className="rc-store-input"
            value={form.business_category ?? ''}
            placeholder={lang === 'ko' ? '업종' : 'Category'}
            onChange={event => onChangeForm({ business_category: event.target.value })}
          />
          <input
            className="rc-store-input"
            value={form.region ?? ''}
            placeholder={lang === 'ko' ? '지역' : 'Region'}
            onChange={event => onChangeForm({ region: event.target.value })}
          />
          <input
            className="rc-store-input rc-store-input-wide"
            value={form.address_text ?? ''}
            placeholder={lang === 'ko' ? '주소' : 'Address'}
            onChange={event => onChangeForm({ address_text: event.target.value })}
          />
          <button type="button" className="rc-store-button rc-store-button-primary" onClick={onCreateStore}>
            {lang === 'ko' ? '등록' : 'Create'}
          </button>
        </div>
      )}
    </section>
  );
}

function formatStoreOption(store: RevenueStoreSummary): string {
  const parts = [
    store.store_name,
    store.business_category || store.store_type,
    store.region,
  ].filter(Boolean);
  return parts.join(' · ');
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
  const [stores, setStores] = useState<RevenueStoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => loadSelectedStoreId());
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [storeForm, setStoreForm] = useState<CreateRevenueStorePayload>({
    store_name: '',
    tenant_name: '',
    business_category: '',
    region: '',
    address_text: '',
  });

  useEffect(() => {
    const handleAuthChanged = () => {
      if (!getStoredCognitoToken()) {
        setStores([]);
        setSelectedStoreId(null);
        setBootstrapStatus(null);
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
    setStoreNotice(lang === 'ko' ? '가게 목록을 불러오는 중입니다.' : 'Loading stores.');

    apiFetchStores()
      .then(envelope => {
        if (cancelled) return;
        const nextStores = envelope.stores ?? [];
        setStores(nextStores);
        const saved = loadSelectedStoreId();
        const nextSelected = chooseInitialStore(nextStores, saved);
        setSelectedStoreId(nextSelected);
        setStoreNotice(nextStores.length === 0
          ? (lang === 'ko' ? '등록된 가게가 없습니다.' : 'No stores yet.')
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
    setStoreNotice(lang === 'ko' ? '초기 맥락데이터를 수집하고 있습니다.' : 'Collecting initial context data.');
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
        pollPipelineMetaForBootstrap(storeId);
      })
      .catch(() => {
        setBootstrapStatus(prev => prev ? { ...prev, phase: 'partial', message: 'context_collect_failed' } : prev);
        setStoreNotice(lang === 'ko' ? '일부 맥락데이터 수집이 지연되었습니다.' : 'Some context collection is delayed.');
      });
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
        setScenario(next.scenario);
        setStatuses(next.defaultStatuses);
        setApiNotice(null);
      })
      .catch(() => {
        if (cancelled) return;
        setScenario(SCENARIO);
        setStatuses({ ...DEFAULT_STATUSES });
        setApiNotice('fallback');
      });

    return () => { cancelled = true; };
  }, [apiMode, authReloadTick, selectedStoreId]);

  function handleCreateStore() {
    if (!storeForm.store_name.trim()) {
      setStoreNotice(lang === 'ko' ? '가게 이름을 입력하세요.' : 'Enter a store name.');
      return;
    }

    setStoreLoading(true);
    setStoreNotice(lang === 'ko' ? '가게를 등록하는 중입니다.' : 'Creating store.');
    apiCreateStore({
      store_name: storeForm.store_name.trim(),
      tenant_name: storeForm.tenant_name?.trim() || undefined,
      business_category: storeForm.business_category?.trim() || undefined,
      region: storeForm.region?.trim() || undefined,
      address_text: storeForm.address_text?.trim() || undefined,
    })
      .then(envelope => {
        const created = envelope.store;
        if (!created) throw new Error('missing store');
        setStores(prev => [...prev.filter(store => store.store_id !== created.store_id), created]);
        setSelectedStoreId(created.store_id);
        setStoreForm({ store_name: '', tenant_name: '', business_category: '', region: '', address_text: '' });
        setShowCreateStore(false);
        if (envelope.context_bootstrap_hint?.recommended) {
          setStoreNotice(lang === 'ko' ? '가게 등록 완료 · 초기 맥락데이터를 수집하고 있습니다.' : 'Store created · collecting initial context data.');
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
      .catch(() => {
        setStoreNotice(lang === 'ko' ? '가게 등록에 실패했습니다.' : 'Could not create store.');
      })
      .finally(() => setStoreLoading(false));
  }

  function handleRetryContext() {
    if (!selectedStoreId) return;
    startContextCollection(selectedStoreId, { recommended: true, mode: 'live', reason: 'manual_refresh' }, 'manual_refresh');
  }

  const chromeLabel = lang === 'ko'
    ? '매출 코크핏 — 근거 기반 액션 브리프'
    : 'Merchant Revenue Cockpit — Evidence-backed Action Brief';
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

  return (
    <div className="rc-root" data-theme={effectiveTheme}>
      <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} label={chromeLabel}/>
      <RcHeader
        lang={lang}
        scenario={scenario}
        screen={screen}
        onSetScreen={setScreen}
        storeSwitcher={apiMode && getStoredCognitoToken() ? (
          <StoreSwitcher
            lang={lang}
            stores={stores}
            selectedStoreId={selectedStoreId}
            loading={storeLoading}
            notice={storeNotice}
            showCreate={showCreateStore}
            form={storeForm}
            onSelectStore={setSelectedStoreId}
            onToggleCreate={() => setShowCreateStore(value => !value)}
            onChangeForm={patch => setStoreForm(prev => ({ ...prev, ...patch }))}
            onCreateStore={handleCreateStore}
            compact
          />
        ) : null}
      />
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
      <div className="rc-screen">
        {screen === 'brief' && (
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
