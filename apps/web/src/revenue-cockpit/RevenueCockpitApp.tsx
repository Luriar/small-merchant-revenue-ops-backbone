import { useEffect, useState } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import { apiFetchActions, apiFetchAnomalies, apiFetchBriefs, apiFetchContext, apiFetchPipelineMeta, apiUpdateActionStatus } from './revenueCockpitApi';
import { buildScenarioFromApi, wantsApiData } from './revenueCockpitData';
import { Icon, ChromeBar } from './revenueCockpitShared';
import { RevenueBriefView } from './RevenueBriefView';
import { CauseEvidenceView } from './CauseEvidenceView';
import { ActionPlannerView } from './ActionPlannerView';
import { DataReliabilityView } from './DataReliabilityView';
import type { RcLang, RcTheme, RcScreen, ActionStatuses, ActionStatus, Scenario } from './revenueCockpitTypes';

// ─── persistence helpers ──────────────────────────────────────────────────────

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

// ─── main surface ─────────────────────────────────────────────────────────────

export function RevenueCockpitApp() {
  const [lang, setLangState] = useState<RcLang>(() => loadPref('rc-lang', 'ko', ['ko', 'en'] as const));
  const [theme, setThemeState] = useState<RcTheme>(() => loadPref('rc-theme', 'system', ['light', 'dark', 'system'] as const));
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => resolveTheme(theme));
  const [screen, setScreen] = useState<RcScreen>('brief');
  const [scenario, setScenario] = useState<Scenario>(() => SCENARIO);
  const [statuses, setStatuses] = useState<ActionStatuses>(() => ({ ...DEFAULT_STATUSES }));
  const [apiMode] = useState(() => wantsApiData());
  const [apiNotice, setApiNotice] = useState<'loading' | 'fallback' | 'patch-failed' | null>(() => wantsApiData() ? 'loading' : null);

  const setLang = (l: RcLang) => { setLangState(l); savePref('rc-lang', l); };
  const setTheme = (t: RcTheme) => { setThemeState(t); savePref('rc-theme', t); setEffectiveTheme(resolveTheme(t)); };
  const setStatus = (id: string, s: ActionStatus) => {
    setStatuses(prev => ({ ...prev, [id]: s }));
    if (!apiMode) return;
    apiUpdateActionStatus(id, s)
      .then(() => {
        setApiNotice(prev => (prev === 'patch-failed' ? null : prev));
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
    let cancelled = false;

    Promise.all([
      apiFetchBriefs(),
      apiFetchAnomalies(),
      apiFetchActions(),
      apiFetchContext(),
      apiFetchPipelineMeta(),
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
  }, [apiMode]);

  const chromeLabel = lang === 'ko'
    ? '매출 코크핏 — 근거 기반 액션 브리프'
    : 'Merchant Revenue Cockpit — Evidence-backed Action Brief';
  const noticeCopy = apiNotice === 'loading'
    ? (lang === 'ko' ? 'API 데이터를 확인하는 중입니다.' : 'Checking API data.')
    : apiNotice === 'fallback'
      ? (lang === 'ko' ? 'API 데이터를 불러오지 못해 데모 데이터를 표시합니다.' : 'Could not load API data. Showing demo data instead.')
      : apiNotice === 'patch-failed'
        ? (lang === 'ko' ? '상태 변경을 API에 저장하지 못했습니다. 화면 상태는 유지됩니다.' : 'Could not save the status to the API. The screen state is kept.')
        : null;

  return (
    <div className="rc-root" data-theme={effectiveTheme}>
      <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} label={chromeLabel}/>
      <RcHeader lang={lang} scenario={scenario} screen={screen} onSetScreen={setScreen}/>
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
