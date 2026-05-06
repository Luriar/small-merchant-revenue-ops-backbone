import { useEffect, useState } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import {
  apiCreateStore,
  apiFetchActions,
  apiFetchAnomalies,
  apiFetchBriefs,
  apiFetchContext,
  apiFetchPipelineMeta,
  apiFetchStores,
  apiUpdateActionStatus,
  type CreateRevenueStorePayload,
  type RevenueStoreSummary,
} from './revenueCockpitApi';
import { getStoredAuthSession } from './revenueCockpitAuth';
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
}

function RcHeader({ lang, scenario, screen, onSetScreen }: HeaderProps) {
  const items: Array<{ id: RcScreen; label: string }> = [
    { id: 'brief',       label: tr('navBrief', lang) },
    { id: 'evidence',    label: tr('navEvidence', lang) },
    { id: 'actions',     label: tr('navActions', lang) },
    { id: 'reliability', label: tr('navReliability', lang) },
  ];
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-end', gap: 24,
      padding: '12px 32px 0',
      borderBottom: '1px solid var(--rc-rule)',
      background: 'var(--rc-surface-0)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
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
}: StoreSwitcherProps) {
  return (
    <section className="rc-store-switcher" aria-label={lang === 'ko' ? '가게 선택' : 'Store'}>
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
              {store.store_name}{store.region ? ` · ${store.region}` : ''}
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
  const [apiNotice, setApiNotice] = useState<'loading' | 'fallback' | 'patch-saving' | 'patch-saved' | 'patch-local' | 'patch-failed' | null>(() => wantsApiData() ? 'loading' : null);
  const [authReloadTick, setAuthReloadTick] = useState(0);
  const [stores, setStores] = useState<RevenueStoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => loadSelectedStoreId());
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [storeForm, setStoreForm] = useState<CreateRevenueStorePayload>({
    store_name: '',
    tenant_name: '',
    business_category: '',
    region: '',
    address_text: '',
  });

  useEffect(() => {
    const handleAuthChanged = () => {
      if (!getStoredAuthSession()) {
        setStores([]);
        setSelectedStoreId(null);
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
    const session = getStoredAuthSession();
    if (!session) {
      setStores([]);
      setSelectedStoreId(null);
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
        const nextSelected = nextStores.find(store => store.store_id === saved)?.store_id
          ?? nextStores[0]?.store_id
          ?? null;
        setSelectedStoreId(nextSelected);
        setStoreNotice(nextStores.length === 0
          ? (lang === 'ko' ? '등록된 가게가 없습니다.' : 'No stores yet.')
          : null);
      })
      .catch(() => {
        if (cancelled) return;
        setStores([]);
        setSelectedStoreId(null);
        setStoreNotice(lang === 'ko' ? '가게 목록을 불러오지 못했습니다.' : 'Could not load stores.');
      })
      .finally(() => {
        if (!cancelled) setStoreLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiMode, authReloadTick, lang]);

  useEffect(() => {
    if (!apiMode) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state') && authReloadTick === 0) {
      setApiNotice('loading');
      return;
    }

    let cancelled = false;
    const storeId = selectedStoreId ?? undefined;
    if (getStoredAuthSession() && !storeId) {
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
        setStoreNotice(lang === 'ko' ? '가게가 등록되었습니다.' : 'Store created.');
        window.setTimeout(() => setStoreNotice(null), 2000);
      })
      .catch(() => {
        setStoreNotice(lang === 'ko' ? '가게 등록에 실패했습니다.' : 'Could not create store.');
      })
      .finally(() => setStoreLoading(false));
  }

  const chromeLabel = lang === 'ko'
    ? '매출 코크핏 — 근거 기반 액션 브리프'
    : 'Merchant Revenue Cockpit — Evidence-backed Action Brief';
  const noticeCopy = apiNotice === 'loading'
    ? (lang === 'ko' ? 'API 데이터를 확인하는 중입니다.' : 'Checking API data.')
    : apiNotice === 'fallback'
      ? (lang === 'ko' ? 'API 데이터를 불러오지 못해 데모 데이터를 표시합니다.' : 'Could not load API data. Showing demo data instead.')
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
      <RcHeader lang={lang} scenario={scenario} screen={screen} onSetScreen={setScreen}/>
      {apiMode && getStoredAuthSession() && (
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
        />
      )}
      {noticeCopy && (
        <div className="rc-api-notice">
          <Icon name="shield" size={12}/>
          <span>{noticeCopy}</span>
        </div>
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
