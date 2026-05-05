// direction-a-plus.jsx — FINAL implementation-ready
// Refinements: removed decorative circle, light mode polished, Evidence redesigned with
// baseline-vs-compare, Action cards show difficulty + expected effect + tied evidence,
// Reliability reframed as "Why you can trust this brief".

(function () {
  const { useState } = React;
  const { SCENARIO: S, tr, Sparkline, Icon, Pill, StrengthDots, fmtPct, ChromeBar } = window;

  const themeCSS = `
    .dirAP{
      /* LIGHT — premium SaaS warm */
      --bg: #f6f2ea;
      --surface-0: #fbf8f1;
      --surface-1: #ffffff;
      --surface-2: #f0eadf;
      --surface-3: #e6dfd2;
      --fg: #1f1b16;
      --fg-strong: #0d0b08;
      --fg-muted: #6b6258;
      --fg-dim: #9a9087;
      --rule: rgba(40,30,20,0.09);
      --rule-strong: rgba(40,30,20,0.18);
      --shadow-sm: 0 1px 2px rgba(40,30,20,0.04), 0 1px 1px rgba(40,30,20,0.03);
      --shadow-md: 0 4px 14px rgba(40,30,20,0.06), 0 1px 3px rgba(40,30,20,0.04);
      --shadow-lg: 0 12px 32px rgba(40,30,20,0.08), 0 2px 6px rgba(40,30,20,0.04);
      --accent: #b8542a;
      --accent-strong: #8a3a18;
      --accent-soft: #fbe9dc;
      --accent-soft-bd: rgba(184,84,42,0.18);
      --good: #2f6b48;
      --good-strong: #234f36;
      --good-soft: #e3eee5;
      --good-soft-bd: rgba(47,107,72,0.18);
      --bad: #a23d2a;
      --bad-strong: #7d2c1e;
      --bad-soft: #f7e3dd;
      --bad-soft-bd: rgba(162,61,42,0.20);
      --info: #4a5a78;
      --info-soft: #e3e8f0;
      --info-soft-bd: rgba(74,90,120,0.20);
      --chip-bg: #efe9dd;
      --chip-fg: #4a4239;
      --chip-bd: rgba(40,30,20,0.10);
      --serif: 'Source Serif 4', 'Iowan Old Style', Georgia, serif;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dirAP[data-theme="dark"]{
      --bg: #14110d;
      --surface-0: #1b1814;
      --surface-1: #221e19;
      --surface-2: #2a251f;
      --surface-3: #332d25;
      --fg: #ece6db;
      --fg-strong: #fbf6ec;
      --fg-muted: #a39686;
      --fg-dim: #6e6357;
      --rule: rgba(255,240,220,0.10);
      --rule-strong: rgba(255,240,220,0.18);
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.30);
      --shadow-md: 0 4px 14px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.20);
      --shadow-lg: 0 12px 32px rgba(0,0,0,0.40), 0 2px 6px rgba(0,0,0,0.24);
      --accent: #e08a5f;
      --accent-strong: #f0a37a;
      --accent-soft: rgba(224,138,95,0.14);
      --accent-soft-bd: rgba(224,138,95,0.28);
      --good: #6fa882;
      --good-strong: #8cc09e;
      --good-soft: rgba(111,168,130,0.14);
      --good-soft-bd: rgba(111,168,130,0.30);
      --bad: #d97560;
      --bad-strong: #ea8c79;
      --bad-soft: rgba(217,117,96,0.14);
      --bad-soft-bd: rgba(217,117,96,0.28);
      --info: #8fa1c2;
      --info-soft: rgba(143,161,194,0.14);
      --info-soft-bd: rgba(143,161,194,0.30);
      --chip-bg: #2a251f;
      --chip-fg: #c8bca9;
      --chip-bd: rgba(255,240,220,0.12);
    }
    .dirAP{ background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 13.5px; line-height: 1.5; }
    .dirAP *{ box-sizing: border-box; }
    .dirAP .serif{ font-family: var(--serif); font-feature-settings: "ss01"; }
    .dirAP .mono{ font-family: var(--mono); font-feature-settings: "tnum"; }
    .dirAP .num{ font-variant-numeric: tabular-nums; }
    .dirAP button{ font-family: inherit; }
    .dirAP .card{ background: var(--surface-1); border: 1px solid var(--rule); border-radius: 12px; box-shadow: var(--shadow-sm); }
  `;

  // ─────────────────────────────────────────────────────────────────
  // Action statuses
  const STATES = ['recommended', 'selected', 'planned', 'done', 'dismissed'];
  const stateLabel = (s, lang) => ({
    recommended: { ko: '추천',   en: 'Recommended' },
    selected:    { ko: '선택됨', en: 'Selected' },
    planned:     { ko: '계획됨', en: 'Planned' },
    done:        { ko: '완료',   en: 'Done' },
    dismissed:   { ko: '보류',   en: 'Dismissed' },
  }[s][lang]);
  const stateTone = {
    recommended: { bg: 'var(--surface-2)',  fg: 'var(--fg-muted)',     bd: 'var(--rule)' },
    selected:    { bg: 'var(--accent-soft)',fg: 'var(--accent-strong)',bd: 'var(--accent-soft-bd)' },
    planned:     { bg: 'var(--info-soft)',  fg: 'var(--info)',         bd: 'var(--info-soft-bd)' },
    done:        { bg: 'var(--good-soft)',  fg: 'var(--good-strong)',  bd: 'var(--good-soft-bd)' },
    dismissed:   { bg: 'transparent',       fg: 'var(--fg-dim)',       bd: 'var(--rule)' },
  };

  function StatePill({ state, lang, size = 'sm' }) {
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

  function StateMenu({ state, setState, lang, align = 'left' }) {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpen(o => !o)} style={{
          all: 'unset', cursor: 'pointer',
          padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 500,
          color: 'var(--fg-muted)', background: 'var(--surface-2)',
          border: '1px solid var(--rule)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {lang === 'ko' ? '상태 변경' : 'Change'} <Icon name="arrow-down" size={10}/>
        </button>
        {open && (
          <div onMouseLeave={() => setOpen(false)} style={{
            position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)',
            [align]: 0,
            background: 'var(--surface-1)', border: '1px solid var(--rule-strong)', borderRadius: 8,
            boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 150,
          }}>
            {STATES.map(s => (
              <button key={s} onClick={() => { setState(s); setOpen(false); }} style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 6, width: '100%', boxSizing: 'border-box',
                background: state === s ? 'var(--surface-2)' : 'transparent',
                fontSize: 12, color: stateTone[s].fg,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateTone[s].fg, opacity: 0.9 }}/>
                {stateLabel(s, lang)}
                {state === s && <span style={{ marginLeft: 'auto' }}><Icon name="check" size={11}/></span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function Header({ lang, screen, setScreen }) {
    const items = [
      { id: 'brief', label: tr('navBrief', lang) },
      { id: 'evidence', label: tr('navEvidence', lang) },
      { id: 'actions', label: tr('navActions', lang) },
      { id: 'reliability', label: tr('navReliability', lang) },
    ];
    return (
      <header style={{
        display: 'flex', alignItems: 'flex-end', gap: 24,
        padding: '12px 32px 0',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--surface-0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon name="flag" size={13}/>
          </div>
          <span className="serif" style={{ fontSize: 16, letterSpacing: '-0.01em', color: 'var(--fg-strong)' }}>
            Revenue&nbsp;<span style={{ fontStyle: 'italic', color: 'var(--accent-strong)' }}>OS</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', borderLeft: '1px solid var(--rule)', paddingLeft: 10, marginLeft: 4 }}>
            {S.area[lang]} · {S.category[lang]} · {S.compare[lang]}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {items.map(it => (
            <button key={it.id} onClick={() => setScreen(it.id)} style={{
              all: 'unset', cursor: 'pointer', padding: '8px 14px',
              fontSize: 12.5, fontWeight: 500,
              color: screen === it.id ? 'var(--fg-strong)' : 'var(--fg-muted)',
              borderBottom: screen === it.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>{it.label}</button>
          ))}
        </nav>
      </header>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function AnnotatedChart({ lang, height = 240 }) {
    const series = S.revSeries;
    const W = 720, H = height;
    const pad = { l: 44, r: 150, t: 26, b: 32 };
    const min = 84, max = 104;
    const xs = series.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / (series.length - 1));
    const ys = series.map(p => pad.t + (1 - (p.v - min) / (max - min)) * (H - pad.t - pad.b));
    const linePath = series.map((_, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xs[xs.length-1]} ${H - pad.b} L ${xs[0]} ${H - pad.b} Z`;
    const ticks = [85, 90, 95, 100];
    const annotations = [
      { id: 'demand',      yFrac: 0.18, label: lang === 'ko' ? '생활인구 −8.4%'    : 'Foot traffic −8.4%' },
      { id: 'weather',     yFrac: 0.45, label: lang === 'ko' ? '강수일수 +28%'     : 'Rainy days +28%' },
      { id: 'competition', yFrac: 0.72, label: lang === 'ko' ? '점포수 +6.1%'      : 'Stores +6.1%' },
    ];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="apArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {ticks.map(t => {
          const y = pad.t + (1 - (t - min) / (max - min)) * (H - pad.t - pad.b);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r + 8} y1={y} y2={y}
                stroke="var(--rule)" strokeDasharray={t === 100 ? '0' : '2 4'}/>
              <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--fg-dim)" className="mono">{t}</text>
            </g>
          );
        })}
        {series.map((p, i) => (
          <text key={i} x={xs[i]} y={H - pad.b + 14} fontSize="10" textAnchor="middle" fill="var(--fg-dim)" className="mono">
            {p.label}
          </text>
        ))}
        {/* drop band */}
        <rect x={xs[6]} y={pad.t} width={xs[7] - xs[6]} height={H - pad.t - pad.b} fill="var(--bad-soft)" opacity="0.55"/>
        <path d={areaPath} fill="url(#apArea)"/>
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        {/* baseline */}
        <circle cx={xs[6]} cy={ys[6]} r="3.5" fill="var(--surface-1)" stroke="var(--accent)" strokeWidth="1.6"/>
        <text x={xs[6]} y={ys[6] - 11} textAnchor="middle" fontSize="10" fill="var(--fg-muted)" className="mono">
          {tr('baselineLabel', lang)}
        </text>
        {/* compare */}
        <circle cx={xs[7]} cy={ys[7]} r="4.5" fill="var(--bad-strong)"/>
        {/* drop indicator */}
        <line x1={xs[6] + 4} x2={xs[7] - 4} y1={(ys[6] + ys[7]) / 2 - 14} y2={(ys[6] + ys[7]) / 2 - 14}
          stroke="var(--bad-strong)" strokeWidth="1.2"/>
        <text x={(xs[6] + xs[7]) / 2} y={(ys[6] + ys[7]) / 2 - 18} textAnchor="middle"
          fontSize="11" fontWeight="700" fill="var(--bad-strong)" className="num">
          −12.0%
        </text>
        {/* cause pins */}
        {annotations.map(a => {
          const ay = pad.t + a.yFrac * (H - pad.t - pad.b);
          return (
            <g key={a.id}>
              <line x1={xs[7] + 6} x2={W - pad.r + 8} y1={ys[7]} y2={ay}
                stroke="var(--rule-strong)" strokeWidth="1"/>
              <circle cx={W - pad.r + 8} cy={ay} r="3" fill="var(--accent-strong)"/>
              <text x={W - pad.r + 16} y={ay + 3.5} fontSize="10.5" fill="var(--fg)" fontWeight="500">
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Compact cause row for the right rail
  function CauseRail({ c, lang, rank, onOpen }) {
    return (
      <button onClick={onOpen} style={{
        all: 'unset', cursor: 'pointer',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
        padding: '11px 12px', alignItems: 'center', width: '100%', boxSizing: 'border-box',
        border: '1px solid var(--rule)', borderRadius: 10, background: 'var(--surface-1)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'var(--surface-2)', color: 'var(--accent-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={c.icon} size={15}/></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>0{rank}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{c.title[lang]}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.headline[lang]}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 600,
            color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
            {fmtPct(c.delta)}
          </span>
          <span style={{ color: c.strength === 'strong' ? 'var(--accent-strong)' : c.strength === 'medium' ? 'var(--fg-muted)' : 'var(--fg-dim)' }}>
            <StrengthDots level={c.strength}/>
          </span>
        </div>
      </button>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // BRIEF — decorative circle removed, light mode polished
  function Brief({ lang, setScreen, statuses, setStatus }) {
    const thisWeek = S.actions.filter(a => a.timeframe === 'this-week');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', minHeight: '100%' }}>
        {/* LEFT */}
        <section style={{ padding: '32px 36px 44px', borderRight: '1px solid var(--rule)', background: 'var(--surface-0)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5,
            color: 'var(--fg-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <Icon name="dot" size={9}/>
            {lang === 'ko' ? '이번 분기 매출 브리프' : 'This quarter — Revenue Brief'}
          </div>

          <h1 className="serif" style={{
            fontSize: 40, lineHeight: 1.08, letterSpacing: '-0.02em',
            margin: '14px 0 12px', color: 'var(--fg-strong)', fontWeight: 400,
            textWrap: 'pretty', maxWidth: 720,
          }}>
            {lang === 'ko'
              ? <>2024년 4분기 추정매출이 직전 분기 대비 <span style={{ color: 'var(--accent-strong)' }}>12.0%</span> 줄었습니다.</>
              : <>Estimated revenue fell <span style={{ color: 'var(--accent-strong)' }}>12.0%</span> from the prior quarter.</>}
          </h1>

          <p style={{ fontSize: 14.5, color: 'var(--fg-muted)', maxWidth: 600, margin: '0 0 22px', lineHeight: 1.6 }}>
            {lang === 'ko'
              ? '거래건수 감소와 함께 관측되었습니다. 같은 기간 생활인구가 줄고 강수일수와 인근 점포수가 늘었습니다. 가능성 높은 원인 후보 4건과 이번 주 액션을 아래에서 확인해주세요.'
              : 'Transaction count fell alongside revenue. Foot traffic softened, rainy days rose, and nearby café count grew. Four likely cause candidates and this week\'s actions are below.'}
          </p>

          {/* Annotated chart */}
          <div className="card" style={{ padding: '18px 20px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                  {lang === 'ko' ? '추정매출 지수 · 2024 Q3 = 100' : 'Estimated revenue index · 2024 Q3 = 100'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 5 }}>
                  <span className="serif num" style={{ fontSize: 30, lineHeight: 1, color: 'var(--fg-strong)', fontWeight: 500 }}>
                    ₩ 1,224<span style={{ fontSize: 16, color: 'var(--fg-muted)' }}>M</span>
                  </span>
                  <span className="num" style={{ fontSize: 13, color: 'var(--bad-strong)', fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="arrow-down" size={12}/> {fmtPct(S.revenueChange)} {tr('vsBaseline', lang)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['8Q', '4Q', 'YoY'].map((b, i) => (
                  <button key={b} style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    color: i === 0 ? 'var(--fg-strong)' : 'var(--fg-muted)',
                    background: i === 0 ? 'var(--surface-2)' : 'transparent',
                    border: i === 0 ? '1px solid var(--rule)' : '1px solid transparent',
                  }}>{b}</button>
                ))}
              </div>
            </div>
            <AnnotatedChart lang={lang} height={230}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px dashed var(--rule)',
              fontSize: 11, color: 'var(--fg-muted)' }}>
              <Icon name="dot" size={8}/>
              {lang === 'ko'
                ? '핀은 매출 변화와 함께 관측된 외부 신호입니다 — 원인이 확정된 것은 아닙니다.'
                : 'Pins are external signals observed alongside the change — not proven causes.'}
            </div>
          </div>

          {/* Three secondary metrics */}
          <div className="card" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 18,
            overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
          }}>
            {[
              { lab: lang === 'ko' ? '거래건수'  : 'Transactions', v: '11.9k',   d: S.txnChange,        spark: [{v:100},{v:101},{v:99},{v:102},{v:104},{v:103},{v:100},{v:90}] },
              { lab: lang === 'ko' ? '객단가'    : 'Avg. ticket',  v: '₩6,450',  d: S.ticketChange,     spark: [{v:100},{v:99},{v:101},{v:102},{v:101},{v:100},{v:100},{v:98}] },
              { lab: lang === 'ko' ? '생활인구'  : 'Foot traffic', v: '142k',    d: S.populationChange, spark: [{v:104},{v:103},{v:102},{v:101},{v:101},{v:100},{v:100},{v:91.6}] },
            ].map((m, i) => (
              <div key={i} style={{ padding: '13px 16px', borderLeft: i ? '1px solid var(--rule)' : 'none' }}>
                <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{m.lab}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                  <span className="num serif" style={{ fontSize: 19, color: 'var(--fg-strong)' }}>{m.v}</span>
                  <span className="num" style={{ fontSize: 11.5, fontWeight: 600,
                    color: m.d < 0 ? 'var(--bad-strong)' : 'var(--good-strong)' }}>{fmtPct(m.d)}</span>
                </div>
                <div style={{ color: m.d < 0 ? 'var(--bad)' : 'var(--good)', marginTop: 2 }}>
                  <Sparkline points={m.spark} width={180} height={24} fade="rgba(0,0,0,0.04)"/>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly plan */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
                {lang === 'ko' ? '이번 주 실행 계획' : 'This week — execution plan'}
              </h2>
              <button onClick={() => setScreen('actions')} style={{
                all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--accent-strong)',
                display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
              }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
            </div>
            <WeeklyPlan lang={lang} actions={thisWeek} statuses={statuses} setStatus={setStatus}/>
          </div>
        </section>

        {/* RIGHT RAIL */}
        <aside style={{ padding: '32px 28px 44px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 className="serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
                {tr('whyMaybe', lang)}
              </h2>
              <button onClick={() => setScreen('evidence')} style={{
                all: 'unset', cursor: 'pointer', fontSize: 11.5, color: 'var(--accent-strong)',
                display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500,
              }}>{tr('seeEvidence', lang)} <Icon name="arrow-right" size={11}/></button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--fg-muted)', margin: '0 0 10px' }}>
              {lang === 'ko' ? '4개 후보 · 신호 강함 순' : 'Four candidates · sorted by signal strength'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {S.causes.map((c, i) => <CauseRail key={c.id} c={c} lang={lang} rank={i+1} onOpen={() => setScreen('evidence')}/>)}
            </div>
          </div>

          <div style={{
            border: '1px solid var(--accent-soft-bd)', background: 'var(--accent-soft)',
            borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 className="serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--accent-strong)' }}>
                {tr('thisWeek', lang)}
              </h2>
              <Pill tone="warm" size="sm">3 / 6</Pill>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {S.actions.filter(a => a.timeframe === 'this-week').slice(0, 3).map(a => (
                <ShortlistRow key={a.id} a={a} lang={lang}
                  state={statuses[a.id]} setState={st => setStatus(a.id, st)}/>
              ))}
            </div>
          </div>

          <ReliabilityCompact lang={lang} onOpen={() => setScreen('reliability')}/>
        </aside>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function WeeklyPlan({ lang, actions, statuses, setStatus }) {
    const days = lang === 'ko'
      ? [{k:'mon',d:'월'},{k:'tue',d:'화'},{k:'wed',d:'수'},{k:'thu',d:'목'},{k:'fri',d:'금'}]
      : [{k:'mon',d:'Mon'},{k:'tue',d:'Tue'},{k:'wed',d:'Wed'},{k:'thu',d:'Thu'},{k:'fri',d:'Fri'}];
    const dayFor = (id) => ({ 'rain-coupon': 0, 'stamp-card': 2, 'delivery-push': 4, 'instagram': 1, 'winter-set': 3, 'staff-rebalance': 0 }[id] ?? 0);
    const byDay = days.map((_, i) => actions.filter(a => dayFor(a.id) === i));
    const todayIdx = 0;
    return (
      <div className="card" style={{ overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--rule)' }}>
          {days.map((d, i) => (
            <div key={d.k} style={{
              padding: '10px 14px', borderLeft: i ? '1px solid var(--rule)' : 'none',
              background: i === todayIdx ? 'var(--surface-2)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  {lang === 'ko' ? `12·${9+i}` : `Dec ${9+i}`}
                </div>
                <div className="serif" style={{ fontSize: 14, fontWeight: 600, color: i === todayIdx ? 'var(--accent-strong)' : 'var(--fg-strong)' }}>
                  {d.d}{i === todayIdx && <span style={{ fontSize: 9.5, color: 'var(--accent)', marginLeft: 6, letterSpacing: '0.06em' }}>{lang === 'ko' ? '오늘' : 'TODAY'}</span>}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{byDay[i].length}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', minHeight: 200 }}>
          {byDay.map((items, i) => (
            <div key={i} style={{
              padding: 10, borderLeft: i ? '1px solid var(--rule)' : 'none',
              background: 'var(--surface-0)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {items.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px dashed var(--rule)', borderRadius: 8, fontSize: 10.5,
                  color: 'var(--fg-dim)', minHeight: 80, padding: 8, textAlign: 'center' }}>
                  {lang === 'ko' ? '비어있음' : 'Open'}
                </div>
              ) : items.map(a => (
                <PlanChip key={a.id} a={a} lang={lang} state={statuses[a.id]} setState={st => setStatus(a.id, st)}/>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function PlanChip({ a, lang, state, setState }) {
    const tone = stateTone[state];
    return (
      <div style={{
        background: state === 'dismissed' ? 'transparent' : 'var(--surface-1)',
        border: `1px solid ${state === 'dismissed' ? 'var(--rule)' : tone.bd}`,
        borderLeft: `3px solid ${tone.fg}`,
        borderRadius: 8, padding: '9px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
        opacity: state === 'dismissed' ? 0.55 : 1,
        boxShadow: state === 'dismissed' ? 'none' : 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatePill state={state} lang={lang} size="sm"/>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3, color: 'var(--accent-strong)', opacity: 0.85 }}>
            {a.tied.map(t => <Icon key={t} name={t} size={11}/>)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-strong)', lineHeight: 1.3,
          textDecoration: state === 'done' ? 'line-through' : 'none' }}>
          {a.title[lang]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.45 }}>{a.summary[lang]}</div>
        <StateMenu state={state} setState={setState} lang={lang}/>
      </div>
    );
  }

  function ShortlistRow({ a, lang, state, setState }) {
    return (
      <div style={{
        background: 'var(--surface-1)', borderRadius: 10,
        border: '1px solid var(--rule)', boxShadow: 'var(--shadow-sm)',
        padding: '11px 12px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <StatePill state={state} lang={lang} size="sm"/>
            <span style={{ display: 'inline-flex', gap: 3, color: 'var(--accent-strong)', opacity: 0.85 }}>
              {a.tied.map(t => <Icon key={t} name={t} size={11}/>)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)',
            textDecoration: state === 'done' ? 'line-through' : 'none' }}>{a.title[lang]}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{a.summary[lang]}</div>
        </div>
        <StateMenu state={state} setState={setState} lang={lang} align="right"/>
      </div>
    );
  }

  function ReliabilityCompact({ lang, onOpen }) {
    return (
      <button onClick={onOpen} className="card" style={{
        all: 'unset', cursor: 'pointer', display: 'block', boxSizing: 'border-box',
        background: 'var(--surface-1)', border: '1px solid var(--rule)', borderRadius: 12,
        padding: '14px 16px', boxShadow: 'var(--shadow-sm)', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--good-soft)', color: 'var(--good-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="check" size={13}/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-strong)' }}>
              {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>
              {lang === 'ko' ? '5개 데이터 모두 정상 · 최근 14회 실행 무실패' : '5/5 sources OK · 14 runs without failure'}
            </div>
          </div>
          <Icon name="arrow-right" size={13}/>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {S.reliability.sources.map(src => (
            <div key={src.id} title={src.name[lang]} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: src.status === 'ok' ? 'var(--good)' : 'var(--accent)',
              opacity: 0.85,
            }}/>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-dim)' }} className="mono">
          {tr('freshAsOf', lang)} {S.reliability.lastRun[lang]} · {lang === 'ko' ? '상권/업종 단위 추정치' : 'Trade-area estimate'}
        </div>
      </button>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // EVIDENCE — redesigned
  // For each cause: summary, baseline vs compare metric comparison,
  // linked revenue/transaction change, sources in user-friendly language,
  // caution note about correlation ≠ causation.
  function Evidence({ lang }) {
    const [active, setActive] = useState(S.causes[0].id);
    const c = S.causes.find(x => x.id === active);

    // Per-cause baseline vs compare values (display-only).
    const compareBlocks = {
      demand: {
        primary: {
          label: { ko: '평균 생활인구 (분기)', en: 'Mean foot traffic (quarter)' },
          base:  { v: '155,200', sub: { ko: '24년 3분기', en: '2024 Q3' } },
          comp:  { v: '142,100', sub: { ko: '24년 4분기', en: '2024 Q4' } },
          delta: -8.4,
          unit:  { ko: '명/일',  en: 'people/day' },
        },
        linked: [
          { label: { ko: '거래건수',   en: 'Transactions' }, delta: -10.2, hint: { ko: '함께 감소', en: 'fell together' } },
          { label: { ko: '추정매출',   en: 'Revenue' },      delta: -12.0, hint: { ko: '함께 감소', en: 'fell together' } },
        ],
        sources: [
          { name: { ko: '서울 생활인구 (SKT)',     en: 'Seoul Floating Population (SKT)' }, plain: { ko: '시간대별 인구 추정', en: 'Hourly population estimate' } },
          { name: { ko: '추정매출 시그널',         en: 'Revenue signal' },                    plain: { ko: '카드 결제 기반', en: 'Card-payment based' } },
        ],
      },
      weather: {
        primary: {
          label: { ko: '강수일수 (분기)', en: 'Rainy days (quarter)' },
          base:  { v: '14', sub: { ko: '24년 3분기', en: '2024 Q3' } },
          comp:  { v: '18', sub: { ko: '24년 4분기', en: '2024 Q4' } },
          delta: +28.0,
          unit:  { ko: '일',     en: 'days' },
        },
        linked: [
          { label: { ko: '비 오는 날 거래', en: 'Txn on rainy days' }, delta: -16.4, hint: { ko: '강한 음의 상관', en: 'strong negative corr.' } },
          { label: { ko: '맑은 날 거래',    en: 'Txn on clear days' }, delta: -3.1,  hint: { ko: '약한 변화',     en: 'minor change' } },
        ],
        sources: [
          { name: { ko: '기상청 ASOS · 서울', en: 'KMA ASOS · Seoul' }, plain: { ko: '관측소 일별 강수', en: 'Daily station data' } },
        ],
      },
      competition: {
        primary: {
          label: { ko: '인근 카페 점포수',  en: 'Nearby café count' },
          base:  { v: '198', sub: { ko: '24년 3분기 평균', en: 'avg. Q3' } },
          comp:  { v: '210', sub: { ko: '24년 4분기 평균', en: 'avg. Q4' } },
          delta: +6.1,
          unit:  { ko: '개소',   en: 'venues' },
        },
        linked: [
          { label: { ko: '단골 방문빈도', en: 'Regular visit freq.' }, delta: -4.3, hint: { ko: '소폭 감소', en: 'slightly down' } },
          { label: { ko: '신규 고객 비율', en: 'New-customer share' }, delta: -2.0, hint: { ko: '소폭 감소', en: 'slightly down' } },
        ],
        sources: [
          { name: { ko: '업종별 인허가 현황', en: 'Permitted business registry' }, plain: { ko: '구청 공개자료',     en: 'District-office data' } },
        ],
      },
      context: {
        primary: {
          label: { ko: '공휴일 수 (분기)', en: 'Public holidays (quarter)' },
          base:  { v: '7', sub: { ko: '24년 3분기', en: '2024 Q3' } },
          comp:  { v: '6', sub: { ko: '24년 4분기', en: '2024 Q4' } },
          delta: -14.3,
          unit:  { ko: '일',    en: 'days' },
        },
        linked: [
          { label: { ko: '공휴일 매출 비중', en: 'Holiday share of rev.' }, delta: -1.1, hint: { ko: '미미한 변화', en: 'marginal' } },
        ],
        sources: [
          { name: { ko: '공휴일·이벤트 캘린더', en: 'Holidays & events calendar' }, plain: { ko: '연간 공식 캘린더', en: 'Annual calendar' } },
        ],
      },
    };
    const block = compareBlocks[c.id];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '100%' }}>
        {/* sidebar list */}
        <aside style={{ borderRight: '1px solid var(--rule)', padding: '28px 0', background: 'var(--surface-0)' }}>
          <div style={{ padding: '0 24px 14px' }}>
            <div className="serif" style={{ fontSize: 22, color: 'var(--fg-strong)', fontWeight: 500 }}>
              {tr('causeLabel', lang)}
            </div>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
              {lang === 'ko' ? '신호 강도 순서로 정렬했어요.' : 'Sorted by signal strength.'}
            </p>
          </div>
          {S.causes.map((cs, i) => (
            <button key={cs.id} onClick={() => setActive(cs.id)} style={{
              all: 'unset', cursor: 'pointer', display: 'grid',
              gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
              padding: '12px 24px', width: '100%', boxSizing: 'border-box',
              borderLeft: active === cs.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: active === cs.id ? 'var(--surface-2)' : 'transparent',
            }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>0{i+1}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-strong)' }}>{cs.title[lang]}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>{tr('strength_' + cs.strength, lang)}</div>
              </div>
              <span style={{ color: 'var(--fg-muted)' }}><StrengthDots level={cs.strength}/></span>
            </button>
          ))}

          <div style={{ padding: '16px 24px 0' }}>
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-bd)',
              fontSize: 11.5, color: 'var(--accent-strong)', lineHeight: 1.55,
            }}>
              <Icon name="shield" size={11}/> &nbsp;
              {lang === 'ko'
                ? '함께 관측되었다는 사실이 인과관계를 의미하지 않습니다. 추가 확인이 필요합니다.'
                : 'Observed together does not mean causation — needs further confirmation.'}
            </div>
          </div>
        </aside>

        {/* DETAIL */}
        <main style={{ padding: '32px 40px 44px' }}>
          {/* Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
            <Icon name={c.icon} size={12}/> {tr('strength_' + c.strength, lang)} · {tr('observedTogether', lang)}
          </div>
          <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 400, margin: '10px 0 6px', color: 'var(--fg-strong)' }}>
            {c.title[lang]}
          </h1>
          <p className="serif" style={{ fontSize: 17, lineHeight: 1.45, color: 'var(--fg)', margin: '0 0 12px', fontStyle: 'italic', maxWidth: 720 }}>
            "{c.headline[lang]}"
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 720, lineHeight: 1.65, marginTop: 0 }}>{c.body[lang]}</p>

          {/* Baseline vs Compare card */}
          <div className="card" style={{ marginTop: 22, padding: '20px 22px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 14 }}>
              {lang === 'ko' ? '관측된 지표 비교' : 'Observed metric comparison'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'stretch', gap: 18 }}>
              {/* Baseline */}
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fg-muted)' }}/>
                  {tr('baselineLabel', lang)} · {block.primary.base.sub[lang]}
                </div>
                <div className="serif num" style={{ fontSize: 32, fontWeight: 500, color: 'var(--fg-strong)', marginTop: 6, lineHeight: 1 }}>
                  {block.primary.base.v}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>{block.primary.label[lang]} · {block.primary.unit[lang]}</div>
              </div>
              {/* Arrow */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 4px' }}>
                <Icon name="arrow-right" size={18}/>
                <span className="num" style={{ fontSize: 14, fontWeight: 700,
                  color: block.primary.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
                  {fmtPct(block.primary.delta)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {lang === 'ko' ? '변화량' : 'Change' }
                </span>
              </div>
              {/* Compare */}
              <div style={{ padding: '14px 16px', borderRadius: 10,
                background: block.primary.delta < 0 ? 'var(--bad-soft)' : 'var(--accent-soft)',
                border: `1px solid ${block.primary.delta < 0 ? 'var(--bad-soft-bd)' : 'var(--accent-soft-bd)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: block.primary.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)',
                  textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}/>
                  {tr('compareLabel', lang)} · {block.primary.comp.sub[lang]}
                </div>
                <div className="serif num" style={{ fontSize: 32, fontWeight: 500,
                  color: block.primary.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)',
                  marginTop: 6, lineHeight: 1 }}>
                  {block.primary.comp.v}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>{block.primary.label[lang]} · {block.primary.unit[lang]}</div>
              </div>
            </div>
          </div>

          {/* Linked metrics */}
          <div className="card" style={{ marginTop: 14, padding: '18px 22px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 6 }}>
              {lang === 'ko' ? '연관 지표 · 함께 관측되었습니다' : 'Linked metrics · observed together'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px', maxWidth: 600 }}>
              {lang === 'ko'
                ? '이 후보가 관측된 같은 기간 동안의 매출/거래 관련 지표 변화입니다.'
                : 'How revenue and transaction signals moved over the same period.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.linked.length}, 1fr)`, gap: 10 }}>
              {block.linked.map((m, i) => (
                <div key={i} style={{
                  padding: '12px 14px', border: '1px solid var(--rule)',
                  borderRadius: 10, background: 'var(--surface-0)',
                }}>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginBottom: 6 }}>{m.label[lang]}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="num serif" style={{
                      fontSize: 22, fontWeight: 500,
                      color: m.delta < 0 ? 'var(--bad-strong)' : 'var(--good-strong)',
                    }}>{fmtPct(m.delta)}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{m.hint[lang]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sources */}
          <div className="card" style={{ marginTop: 14, padding: '18px 22px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }}>
              {tr('howWeKnow', lang)}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {block.sources.map((src, i) => (
                <li key={i} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                  gap: 12, alignItems: 'center', padding: '8px 12px',
                  background: 'var(--surface-0)', border: '1px solid var(--rule)',
                  borderRadius: 8,
                }}>
                  <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--surface-2)',
                    color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="doc" size={13}/>
                  </span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-strong)' }}>{src.name[lang]}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>{src.plain[lang]}</div>
                  </div>
                  <Pill tone="good" size="sm">{lang === 'ko' ? '정상' : 'OK'}</Pill>
                </li>
              ))}
            </ul>
          </div>

          {/* Caution */}
          <div style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--rule)',
            fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Icon name="shield" size={14}/>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
                {lang === 'ko' ? '인과관계가 확정된 것은 아닙니다.' : 'This is not a proven cause.'}
              </div>
              {lang === 'ko'
                ? '두 지표가 함께 움직였다는 관측이며, 한쪽이 다른 쪽을 일으켰다고 단정할 수 없습니다. 다른 후보와 함께 검토 후 액션을 결정해주세요.'
                : 'The two signals moved together — that doesn\'t prove one caused the other. Review alongside other candidates before deciding actions.'}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // ACTIONS — strengthened cards
  function Actions({ lang, statuses, setStatus }) {
    const groups = STATES.map(s => ({
      key: s, label: stateLabel(s, lang),
      items: S.actions.filter(a => statuses[a.id] === s),
    }));
    return (
      <div style={{ padding: '32px 36px 44px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {tr('navActions', lang)}
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 6, maxWidth: 600, lineHeight: 1.6 }}>
              {lang === 'ko'
                ? '근거 후보에 연결된 6개의 추천 액션입니다. 매출 회복을 보장하지 않습니다 — 검토하고 본인 매장에 맞춰 결정해주세요.'
                : 'Six actions tied to the cause candidates. None guarantees revenue recovery — review and decide what fits your shop.'}
            </p>
          </div>
          <Pill tone="warm">{lang === 'ko' ? '6개 추천' : '6 recommended'}</Pill>
        </div>

        {/* Status flow legend */}
        <div className="card" style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', alignSelf: 'center', marginRight: 4 }}>
            {lang === 'ko' ? '상태 흐름' : 'Status flow'}
          </span>
          {STATES.map((s, i) => (
            <React.Fragment key={s}>
              <StatePill state={s} lang={lang}/>
              {i < STATES.length - 1 && <span style={{ alignSelf: 'center', color: 'var(--fg-dim)' }}><Icon name="arrow-right" size={11}/></span>}
            </React.Fragment>
          ))}
        </div>

        {/* Kanban */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 18 }}>
          {groups.map(g => (
            <div key={g.key} style={{
              border: '1px solid var(--rule)', borderRadius: 12, background: 'var(--surface-0)',
              padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 380,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <StatePill state={g.key} lang={lang}/>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{g.items.length}</span>
              </div>
              {g.items.length === 0 && (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: 'var(--fg-dim)',
                  border: '1px dashed var(--rule)', borderRadius: 8, padding: 16, textAlign: 'center',
                }}>
                  {lang === 'ko' ? '비어있음' : 'Empty'}
                </div>
              )}
              {g.items.map(a => <ActionCard key={a.id} a={a} lang={lang}
                state={statuses[a.id]} setState={st => setStatus(a.id, st)}/>)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ActionCard({ a, lang, state, setState }) {
    const tone = stateTone[state];
    const tiedNames = a.tied.map(id => S.causes.find(c => c.id === id)).filter(Boolean);
    // Difficulty (1-3) and expected effect (1-3)
    const diffN = a.effort === 'low' ? 1 : a.effort === 'medium' ? 2 : 3;
    const impN  = a.impact === 'low' ? 1 : a.impact === 'medium' ? 2 : 3;
    return (
      <div className="card" style={{
        borderLeft: `3px solid ${tone.fg}`,
        padding: '12px 12px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
        opacity: state === 'dismissed' ? 0.6 : 1,
      }}>
        {/* Title + tied evidence */}
        <div className="serif" style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--fg-strong)', lineHeight: 1.3,
          textDecoration: state === 'done' ? 'line-through' : 'none' }}>
          {a.title[lang]}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{a.summary[lang]}</div>

        {/* Difficulty & expected effect — explicit dotted scale */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: 'var(--surface-0)', border: '1px solid var(--rule)',
        }}>
          <DotMeter label={lang === 'ko' ? '난이도' : 'Difficulty'} value={diffN} max={3} hint={tr('effort_' + a.effort, lang)}/>
          <DotMeter label={lang === 'ko' ? '예상 효과' : 'Expected effect'} value={impN} max={3} hint={tr('impact_' + a.impact, lang)} positive/>
        </div>

        {/* Tied evidence — explicit list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'ko' ? '연결된 근거' : 'Tied evidence'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tiedNames.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px 2px 5px', borderRadius: 999,
                background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                border: '1px solid var(--accent-soft-bd)',
                fontSize: 10.5, fontWeight: 500,
              }}>
                <Icon name={c.icon} size={10}/> {c.title[lang]}
              </span>
            ))}
          </div>
        </div>

        {/* Steps */}
        <ol style={{ margin: '2px 0 0', padding: '0 0 0 16px', fontSize: 11, color: 'var(--fg)', lineHeight: 1.55 }}>
          {a.steps.map((s, i) => <li key={i}>{s[lang]}</li>)}
        </ol>

        {/* State + cycle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <StatePill state={state} lang={lang} size="sm"/>
          <StateMenu state={state} setState={setState} lang={lang} align="right"/>
        </div>
      </div>
    );
  }

  function DotMeter({ label, value, max = 3, hint, positive = false }) {
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {Array.from({ length: max }).map((_, i) => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: i < value
                  ? (positive ? 'var(--good-strong)' : 'var(--accent-strong)')
                  : 'var(--surface-2)',
                border: i < value ? 'none' : '1px solid var(--rule)',
              }}/>
            ))}
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 500 }}>{hint}</span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RELIABILITY — "Why you can trust this brief"
  function Reliability({ lang }) {
    return (
      <div style={{ padding: '32px 40px 44px' }}>
        {/* Top — friendly explanation */}
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5,
            color: 'var(--fg-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <Icon name="shield" size={11}/> {lang === 'ko' ? '신뢰도' : 'Reliability'}
          </div>
          <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, margin: '10px 0 12px', color: 'var(--fg-strong)', letterSpacing: '-0.01em' }}>
            {lang === 'ko' ? '이 브리프를 신뢰할 수 있는 이유' : 'Why you can trust this brief'}
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--fg-muted)', lineHeight: 1.65, margin: 0 }}>
            {lang === 'ko'
              ? '이 브리프는 5개의 공공·결제 데이터를 매일 자동으로 갱신해 만들어집니다. 모든 데이터가 정상 갱신되었고, 최근 14회 실행에서 실패가 없었습니다. 분석은 상권/업종 단위 추정치이며, 결과는 함께 관측된 신호를 정리한 것이지 인과관계를 확정한 것이 아닙니다.'
              : 'This brief is built from five public and payment datasets that refresh daily. All sources are healthy, and the last 14 runs completed without failure. Analysis is at the trade-area / category level — results summarize signals that moved together, not proven causes.'}
          </p>
        </div>

        {/* Three friendly trust statements */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 22, maxWidth: 980 }}>
          {[
            { icon: 'check',   tone: 'good',
              title: lang === 'ko' ? '5개 데이터 모두 정상' : 'All 5 sources healthy',
              body:  lang === 'ko' ? '예정된 주기로 모두 갱신되었습니다.' : 'Each refreshed on its scheduled cadence.' },
            { icon: 'spark2',  tone: 'good',
              title: lang === 'ko' ? '최근 14회 실행 무실패' : 'Last 14 runs · no failures',
              body:  lang === 'ko' ? '계산이 안정적으로 마쳤습니다.' : 'Computations completed cleanly.' },
            { icon: 'shield',  tone: 'warm',
              title: lang === 'ko' ? '추정치임을 잊지 마세요' : 'Remember — estimates',
              body:  lang === 'ko' ? '상권/업종 단위 추정이며, 우리 매장 매출 자체가 아닙니다.' : 'Trade-area estimates, not your store\'s direct sales.' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: '16px 18px' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: s.tone === 'good' ? 'var(--good-soft)' : 'var(--accent-soft)',
                color: s.tone === 'good' ? 'var(--good-strong)' : 'var(--accent-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
              }}><Icon name={s.icon} size={15}/></div>
              <div className="serif" style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg-strong)', marginBottom: 4 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}
        </div>

        {/* Technical detail — collapsible-feeling block, shown by default */}
        <div style={{ marginTop: 28, maxWidth: 980 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h2 className="serif" style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {lang === 'ko' ? '데이터 소스 상세' : 'Source details'}
            </h2>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              {lang === 'ko' ? '· 기술 정보' : '· technical'}
            </span>
          </div>

          <div className="card" style={{ overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1.1fr 0.7fr',
              padding: '11px 18px', fontSize: 10.5, color: 'var(--fg-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              background: 'var(--surface-2)',
            }}>
              <span>{lang === 'ko' ? '데이터 소스' : 'Source'}</span>
              <span>{tr('cadence', lang)}</span>
              <span>{tr('freshAsOf', lang)}</span>
              <span>{tr('coverage', lang)}</span>
              <span style={{ textAlign: 'right' }}>{lang === 'ko' ? '상태' : 'Status'}</span>
            </div>
            {S.reliability.sources.map(src => (
              <div key={src.id} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1.1fr 0.7fr',
                padding: '13px 18px', alignItems: 'center', borderTop: '1px solid var(--rule)', fontSize: 12.5,
              }}>
                <span style={{ color: 'var(--fg-strong)', fontWeight: 500 }}>{src.name[lang]}</span>
                <span style={{ color: 'var(--fg-muted)' }}>{src.cadence[lang]}</span>
                <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: 11.5 }}>{src.freshness}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 80, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: src.coverage + '%', height: '100%',
                      background: src.status === 'ok' ? 'var(--good)' : 'var(--accent)' }}/>
                  </span>
                  <span className="num" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{src.coverage}%</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <Pill tone={src.status === 'ok' ? 'good' : 'warm'} size="sm">
                    {src.status === 'ok' ? (lang === 'ko' ? '정상' : 'OK') : (lang === 'ko' ? '부분' : 'Partial')}
                  </Pill>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Limits */}
        <div style={{
          marginTop: 22, padding: '16px 20px', borderRadius: 12,
          background: 'var(--surface-2)', maxWidth: 980, border: '1px solid var(--rule)',
        }}>
          <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 8 }}>
            {lang === 'ko' ? '한계점 — 꼭 알아두세요' : 'Limits — please keep in mind'}
          </div>
          <ul className="serif" style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--fg)' }}>
            <li>{lang === 'ko' ? '분석 단위는 상권/업종이며, 개별 매장 매출이 아닙니다.' : 'Analysis is at trade-area / category level, not per individual store.'}</li>
            <li>{lang === 'ko' ? '매출과 인구는 모두 공공데이터 기반 추정치입니다.' : 'Revenue and population are public-data estimates.'}</li>
            <li>{lang === 'ko' ? '원인 후보는 함께 관측된 신호이며, 인과관계가 확정된 것이 아닙니다. 추가 확인이 필요합니다.' : 'Cause candidates reflect signals observed together, not proven causes — needs further confirmation.'}</li>
          </ul>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function DirectionAPlus({ initialLang = 'ko', initialTheme = 'light', initialScreen = 'brief', hideChrome = false }) {
    const [lang, setLang] = useState(initialLang);
    const [theme, setTheme] = useState(initialTheme);
    const [screen, setScreen] = useState(initialScreen);
    const [statuses, setStatuses] = useState({
      'rain-coupon': 'selected',
      'stamp-card': 'planned',
      'delivery-push': 'recommended',
      'winter-set': 'recommended',
      'instagram': 'done',
      'staff-rebalance': 'dismissed',
    });
    const setStatus = (id, s) => setStatuses(prev => ({ ...prev, [id]: s }));
    const effective = theme === 'system' ? 'light' : theme;
    return (
      <>
        <style>{themeCSS}</style>
        <div className="dirAP" data-theme={effective} data-screen-label={`A+ · ${screen} · ${effective}`} style={{ minHeight: '100%', background: 'var(--bg)' }}>
          {!hideChrome && (
            <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
              label={lang === 'ko'
                ? '매출 코크핏 — 근거 기반 액션 브리프'
                : 'Merchant Revenue Cockpit — Evidence-backed Action Brief'}/>
          )}
          <Header lang={lang} screen={screen} setScreen={setScreen}/>
          {screen === 'brief'       && <Brief lang={lang} setScreen={setScreen} statuses={statuses} setStatus={setStatus}/>}
          {screen === 'evidence'    && <Evidence lang={lang}/>}
          {screen === 'actions'     && <Actions lang={lang} statuses={statuses} setStatus={setStatus}/>}
          {screen === 'reliability' && <Reliability lang={lang}/>}
        </div>
      </>
    );
  }
  window.DirectionAPlus = DirectionAPlus;
})();
