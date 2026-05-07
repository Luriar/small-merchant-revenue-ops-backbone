import { useState } from 'react';
import type { ActionStatus, RcLang, RcTheme } from './revenueCockpitTypes';

// ─── icon atoms ───────────────────────────────────────────────────────────────

interface IconProps { name: string; size?: number }
export function Icon({ name, size = 16 }: IconProps) {
  const s = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'demand':      return (<svg viewBox="0 0 24 24" {...s}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="6" r="2"/><path d="M14 13c1-1 2-1.5 3-1.5"/></svg>);
    case 'weather':     return (<svg viewBox="0 0 24 24" {...s}><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-1 6.9"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></svg>);
    case 'competition': return (<svg viewBox="0 0 24 24" {...s}><rect x="3" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="13" width="4" height="7"/></svg>);
    case 'context':     return (<svg viewBox="0 0 24 24" {...s}><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>);
    case 'arrow-down':  return (<svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M6 13l6 6 6-6"/></svg>);
    case 'arrow-up':    return (<svg viewBox="0 0 24 24" {...s}><path d="M12 19V5M6 11l6-6 6 6"/></svg>);
    case 'arrow-right': return (<svg viewBox="0 0 24 24" {...s}><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
    case 'spark':       return (<svg viewBox="0 0 24 24" {...s}><path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2 2 .7-2 .7-.8 2-.8-2-2-.7 2-.7z"/></svg>);
    case 'spark2':      return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M6.3 17.7l2-2M15.7 8.3l2-2"/></svg>);
    case 'check':       return (<svg viewBox="0 0 24 24" {...s}><path d="M5 12.5l4 4 10-10"/></svg>);
    case 'plus':        return (<svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14"/></svg>);
    case 'sun':         return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>);
    case 'moon':        return (<svg viewBox="0 0 24 24" {...s}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>);
    case 'auto':        return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>);
    case 'globe':       return (<svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>);
    case 'shield':      return (<svg viewBox="0 0 24 24" {...s}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>);
    case 'doc':         return (<svg viewBox="0 0 24 24" {...s}><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h7M10 17h5"/></svg>);
    case 'flag':        return (<svg viewBox="0 0 24 24" {...s}><path d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>);
    case 'dot':         return (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="3"/></svg>);
    default: return null;
  }
}

// ─── sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  points: Array<{ v: number }>;
  width?: number;
  height?: number;
  dropFrom?: number | null;
  color?: string;
  fade?: string;
}
export function Sparkline({ points, width = 220, height = 56, dropFrom = null, color = 'currentColor', fade = 'rgba(0,0,0,0.06)' }: SparklineProps) {
  if (!points || !points.length) return null;
  const min = Math.min(...points.map(p => p.v));
  const max = Math.max(...points.map(p => p.v));
  const pad = 6;
  const range = Math.max(1, max - min);
  const xs = points.map((_, i) => pad + (i * (width - pad * 2)) / (points.length - 1));
  const ys = points.map(p => height - pad - ((p.v - min) / range) * (height - pad * 2));
  const d = points.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} stroke={fade} strokeDasharray="2 4" />
      <path d={`${d} L ${xs[last]} ${height - pad} L ${xs[0]} ${height - pad} Z`} fill={fade} opacity="0.7" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {dropFrom !== null && (
        <line x1={xs[dropFrom]} x2={xs[last]} y1={ys[dropFrom]} y2={ys[last]} stroke={color} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.55" />
      )}
      {points.map((_, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r={i === last ? 3 : 1.6} fill={i === last ? color : 'currentColor'} opacity={i === last ? 1 : 0.45} />
      ))}
    </svg>
  );
}

// ─── pill ─────────────────────────────────────────────────────────────────────

type PillTone = 'neutral' | 'warm' | 'good' | 'bad' | 'quiet';
interface PillProps { children: React.ReactNode; tone?: PillTone; size?: 'sm' | 'md' }
export function Pill({ children, tone = 'neutral', size = 'md' }: PillProps) {
  const tones: Record<PillTone, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: 'var(--rc-chip-bg)',    fg: 'var(--rc-chip-fg)',       bd: 'var(--rc-chip-bd)' },
    warm:    { bg: 'var(--rc-accent-soft)', fg: 'var(--rc-accent-strong)', bd: 'var(--rc-accent-soft-bd)' },
    good:    { bg: 'var(--rc-good-soft)',   fg: 'var(--rc-good-strong)',   bd: 'var(--rc-good-soft-bd)' },
    bad:     { bg: 'var(--rc-bad-soft)',    fg: 'var(--rc-bad-strong)',    bd: 'var(--rc-bad-soft-bd)' },
    quiet:   { bg: 'transparent',           fg: 'var(--rc-fg-muted)',      bd: 'var(--rc-rule)' },
  };
  const t = tones[tone];
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

// ─── strength dots ────────────────────────────────────────────────────────────

interface StrengthDotsProps { level: 'strong' | 'medium' | 'weak' }
export function StrengthDots({ level }: StrengthDotsProps) {
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

// ─── action state helpers ──────────────────────────────────────────────────────

export const STATES: ActionStatus[] = ['recommended', 'selected', 'planned', 'done', 'dismissed'];

export function stateLabel(s: ActionStatus, lang: RcLang): string {
  const labels: Record<ActionStatus, { ko: string; en: string }> = {
    recommended: { ko: '추천',   en: 'Recommended' },
    selected:    { ko: '선택됨', en: 'Selected' },
    planned:     { ko: '계획됨', en: 'Planned' },
    done:        { ko: '완료',   en: 'Done' },
    dismissed:   { ko: '보류',   en: 'Dismissed' },
  };
  return labels[s][lang];
}

function stateActionLabel(s: ActionStatus, lang: RcLang): string {
  const labels: Record<ActionStatus, { ko: string; en: string }> = {
    recommended: { ko: '선택하기', en: 'Select' },
    selected:    { ko: '선택하기', en: 'Select' },
    planned:     { ko: '계획함',   en: 'Planned' },
    done:        { ko: '완료',     en: 'Done' },
    dismissed:   { ko: '보류',     en: 'Dismiss' },
  };
  return labels[s][lang];
}

function stateMenuLabel(s: ActionStatus, lang: RcLang): string {
  if (s === 'recommended') {
    return lang === 'ko' ? '추천 유지' : 'Keep suggested';
  }
  return stateActionLabel(s, lang);
}

export const stateTone: Record<ActionStatus, { bg: string; fg: string; bd: string }> = {
  recommended: { bg: 'var(--rc-surface-2)',  fg: 'var(--rc-fg-muted)',      bd: 'var(--rc-rule)' },
  selected:    { bg: 'var(--rc-accent-soft)', fg: 'var(--rc-accent-strong)', bd: 'var(--rc-accent-soft-bd)' },
  planned:     { bg: 'var(--rc-info-soft)',   fg: 'var(--rc-info)',           bd: 'var(--rc-info-soft-bd)' },
  done:        { bg: 'var(--rc-good-soft)',   fg: 'var(--rc-good-strong)',   bd: 'var(--rc-good-soft-bd)' },
  dismissed:   { bg: 'transparent',           fg: 'var(--rc-fg-dim)',        bd: 'var(--rc-rule)' },
};

// ─── state pill ───────────────────────────────────────────────────────────────

interface StatePillProps { state: ActionStatus; lang: RcLang; size?: 'sm' | 'md' }
export function StatePill({ state, lang, size = 'sm' }: StatePillProps) {
  const t = stateTone[state];
  const ic = state === 'done' ? 'check' : state === 'planned' ? 'context' : state === 'selected' ? 'plus' : state === 'dismissed' ? 'dot' : 'spark';
  const pad = size === 'sm' ? '2px 8px' : '4px 10px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: pad, fontSize: fs, lineHeight: 1.2,
      borderRadius: 999, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      <Icon name={ic} size={11}/> {stateLabel(state, lang)}
    </span>
  );
}

// ─── state menu ───────────────────────────────────────────────────────────────

interface StateMenuProps {
  state: ActionStatus;
  setState: (s: ActionStatus) => void;
  lang: RcLang;
  align?: 'left' | 'right';
}
export function StateMenu({ state, setState, lang, align = 'left' }: StateMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="rc-no-wrap" onClick={() => setOpen(o => !o)} style={{
        all: 'unset', cursor: 'pointer',
        padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 500,
        color: 'var(--rc-fg-muted)', background: 'var(--rc-surface-2)',
        border: '1px solid var(--rc-rule)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {stateActionLabel(state, lang)} <Icon name="arrow-down" size={10}/>
      </button>
      {open && (
        <div onMouseLeave={() => setOpen(false)} style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)',
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          background: 'var(--rc-surface-1)', border: '1px solid var(--rc-rule-strong)', borderRadius: 8,
          boxShadow: 'var(--rc-shadow-md)', padding: 4, minWidth: 150,
        }}>
          {STATES.map(s => (
            <button className="rc-no-wrap" key={s} onClick={() => { setState(s); setOpen(false); }} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 6, width: '100%', boxSizing: 'border-box',
              background: state === s ? 'var(--rc-surface-2)' : 'transparent',
              fontSize: 12, color: stateTone[s].fg,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateTone[s].fg, opacity: 0.9 }}/>
              {stateMenuLabel(s, lang)}
              {state === s && <span style={{ marginLeft: 'auto' }}><Icon name="check" size={11}/></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── dot meter ────────────────────────────────────────────────────────────────

interface DotMeterProps { label: string; value: number; max?: number; hint: string; positive?: boolean }
export function DotMeter({ label, value, max = 3, hint, positive = false }: DotMeterProps) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--rc-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {Array.from({ length: max }).map((_, i) => (
            <span key={i} style={{
              width: 7, height: 7, borderRadius: '50%',
              background: i < value
                ? (positive ? 'var(--rc-good-strong)' : 'var(--rc-accent-strong)')
                : 'var(--rc-surface-2)',
              border: i < value ? 'none' : '1px solid var(--rc-rule)',
            }}/>
          ))}
        </span>
        <span style={{ fontSize: 11, color: 'var(--rc-fg)', fontWeight: 500 }}>{hint}</span>
      </div>
    </div>
  );
}

// ─── chrome bar ───────────────────────────────────────────────────────────────

interface ChromeBarProps {
  lang: RcLang;
  setLang: (l: RcLang) => void;
  theme: RcTheme;
  setTheme: (t: RcTheme) => void;
  label: string;
  authEmail?: string | null;
  onLogin?: () => void;
  onLogout?: () => void;
}
export function ChromeBar({ lang, setLang, theme, setTheme, label, authEmail, onLogin, onLogout }: ChromeBarProps) {
  const Btn = ({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} style={{
      all: 'unset', cursor: 'pointer', padding: '6px 8px', borderRadius: 6,
      display: 'inline-flex', alignItems: 'center', gap: 4,
      color: active ? 'var(--rc-fg)' : 'var(--rc-fg-muted)',
      background: active ? 'var(--rc-surface-2)' : 'transparent',
      fontSize: 12, fontWeight: 500,
    }}>{children}</button>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderBottom: '1px solid var(--rc-rule)',
      background: 'var(--rc-surface-1)', flexShrink: 0,
    }}>
      <span style={{
        fontSize: 11.5, color: 'var(--rc-fg-dim)', letterSpacing: '0.03em',
        marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {label}
      </span>
      <div style={{ display: 'inline-flex', border: '1px solid var(--rc-rule)', borderRadius: 8, padding: 2, background: 'var(--rc-surface-0)', flexShrink: 0 }}>
        <Btn active={lang === 'ko'} onClick={() => setLang('ko')}>KO</Btn>
        <Btn active={lang === 'en'} onClick={() => setLang('en')}>EN</Btn>
      </div>
      <div style={{ display: 'inline-flex', border: '1px solid var(--rc-rule)', borderRadius: 8, padding: 2, background: 'var(--rc-surface-0)', flexShrink: 0 }}>
        <Btn active={theme === 'light'}  onClick={() => setTheme('light')}  title="Light"><Icon name="sun" size={14}/></Btn>
        <Btn active={theme === 'dark'}   onClick={() => setTheme('dark')}   title="Dark"><Icon name="moon" size={14}/></Btn>
        <Btn active={theme === 'system'} onClick={() => setTheme('system')} title="System"><Icon name="auto" size={14}/></Btn>
      </div>
      {(authEmail || onLogin) && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          minHeight: 26, boxSizing: 'border-box',
          padding: '2px 8px 2px 6px', borderRadius: 999,
          border: '1px solid var(--rc-rule)', background: 'var(--rc-surface-0)',
          fontSize: 11.5, lineHeight: 1,
        }}>
          {authEmail ? (
            <>
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--rc-accent-soft)', color: 'var(--rc-accent-strong)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name="globe" size={9}/>
              </span>
              <span style={{ color: 'var(--rc-fg-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authEmail}
              </span>
              {onLogout && (
                <button onClick={onLogout} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10.5, fontWeight: 500,
                  color: 'var(--rc-fg-dim)', height: 18, padding: '0 6px', borderRadius: 4,
                  border: '1px solid var(--rc-rule)', background: 'var(--rc-surface-1)',
                  marginLeft: 2, display: 'inline-flex', alignItems: 'center', lineHeight: 1,
                }}>
                  {lang === 'ko' ? '로그아웃' : 'Logout'}
                </button>
              )}
            </>
          ) : onLogin ? (
            <>
              <Icon name="globe" size={12}/>
              <button onClick={onLogin} style={{
                all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                color: 'var(--rc-accent-strong)',
              }}>
                {lang === 'ko' ? '로그인' : 'Login'}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
