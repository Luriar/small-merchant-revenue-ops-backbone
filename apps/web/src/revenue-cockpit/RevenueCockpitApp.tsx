import { useEffect, useState } from 'react';
import './revenueCockpit.css';
import { SCENARIO, tr, DEFAULT_STATUSES } from './revenueCockpitCopy';
import { Icon, ChromeBar } from './revenueCockpitShared';
import { RevenueBriefView } from './RevenueBriefView';
import { CauseEvidenceView } from './CauseEvidenceView';
import { ActionPlannerView } from './ActionPlannerView';
import { DataReliabilityView } from './DataReliabilityView';
import type { RcLang, RcTheme, RcScreen, ActionStatuses, ActionStatus } from './revenueCockpitTypes';

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
  screen: RcScreen;
  onSetScreen: (s: RcScreen) => void;
}

function RcHeader({ lang, screen, onSetScreen }: HeaderProps) {
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
          {SCENARIO.area[lang]} · {SCENARIO.category[lang]} · {SCENARIO.compare[lang]}
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
  const [statuses, setStatuses] = useState<ActionStatuses>(() => ({ ...DEFAULT_STATUSES }));

  const setLang = (l: RcLang) => { setLangState(l); savePref('rc-lang', l); };
  const setTheme = (t: RcTheme) => { setThemeState(t); savePref('rc-theme', t); setEffectiveTheme(resolveTheme(t)); };
  const setStatus = (id: string, s: ActionStatus) => setStatuses(prev => ({ ...prev, [id]: s }));

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

  const chromeLabel = lang === 'ko'
    ? '매출 코크핏 — 근거 기반 액션 브리프'
    : 'Merchant Revenue Cockpit — Evidence-backed Action Brief';

  return (
    <div className="rc-root" data-theme={effectiveTheme}>
      <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} label={chromeLabel}/>
      <RcHeader lang={lang} screen={screen} onSetScreen={setScreen}/>
      <div className="rc-screen">
        {screen === 'brief' && (
          <RevenueBriefView
            lang={lang}
            onNavigate={setScreen}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        )}
        {screen === 'evidence' && <CauseEvidenceView lang={lang}/>}
        {screen === 'actions' && (
          <ActionPlannerView
            lang={lang}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        )}
        {screen === 'reliability' && <DataReliabilityView lang={lang}/>}
      </div>
    </div>
  );
}
