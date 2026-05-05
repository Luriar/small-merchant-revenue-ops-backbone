// direction-b.jsx — "Evidence-backed Premium Dashboard"
// Editorial dashboard. The hero is the revenue trend with cause annotations
// layered on it; evidence is presented as an attribution-style stack.
// Cool slate + emerald accent. Denser, more analytical, still calm.

(function () {
  const { useState } = React;
  const { SCENARIO: S, tr, Sparkline, Icon, Pill, StrengthDots, fmtPct, ChromeBar } = window;

  const themeCSS = `
    .dirB{
      --bg: #f5f5f1;
      --surface-0: #fbfbf8;
      --surface-1: #ffffff;
      --surface-2: #eeeee8;
      --fg: #1a1d1c;
      --fg-strong: #0a0c0b;
      --fg-muted: #5a615e;
      --fg-dim: #8d938f;
      --rule: rgba(20,28,24,0.10);
      --rule-strong: rgba(20,28,24,0.18);
      --accent: #0e6b50;
      --accent-strong: #084c39;
      --accent-soft: #def0e7;
      --accent-soft-bd: rgba(14,107,80,0.18);
      --good: #0e6b50;
      --good-strong: #084c39;
      --good-soft: #def0e7;
      --good-soft-bd: rgba(14,107,80,0.18);
      --bad: #b94a30;
      --bad-strong: #8c3520;
      --bad-soft: #f5dfd6;
      --bad-soft-bd: rgba(185,74,48,0.20);
      --warn: #b88312;
      --warn-soft: #f5e8c7;
      --chip-bg: #ecece5;
      --chip-fg: #3e433f;
      --chip-bd: rgba(20,28,24,0.10);
      --serif: 'Source Serif 4', 'Iowan Old Style', Georgia, serif;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dirB[data-theme="dark"]{
      --bg: #0d100f;
      --surface-0: #131715;
      --surface-1: #181d1b;
      --surface-2: #202623;
      --fg: #e6e8e4;
      --fg-strong: #f4f6f1;
      --fg-muted: #9aa19c;
      --fg-dim: #686e6a;
      --rule: rgba(220,232,224,0.10);
      --rule-strong: rgba(220,232,224,0.18);
      --accent: #4cb38a;
      --accent-strong: #6dc8a3;
      --accent-soft: rgba(76,179,138,0.14);
      --accent-soft-bd: rgba(76,179,138,0.30);
      --good: #4cb38a;
      --good-strong: #6dc8a3;
      --good-soft: rgba(76,179,138,0.14);
      --good-soft-bd: rgba(76,179,138,0.30);
      --bad: #d97560;
      --bad-strong: #ea8c79;
      --bad-soft: rgba(217,117,96,0.14);
      --bad-soft-bd: rgba(217,117,96,0.28);
      --chip-bg: #202623;
      --chip-fg: #c5ccc7;
      --chip-bd: rgba(220,232,224,0.12);
    }
    .dirB{ background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 13px; line-height: 1.5; }
    .dirB *{ box-sizing: border-box; }
    .dirB .serif{ font-family: var(--serif); }
    .dirB .mono{ font-family: var(--mono); font-feature-settings: "tnum"; }
    .dirB .num{ font-variant-numeric: tabular-nums; }
    .dirB button{ font-family: inherit; }
  `;

  function Header({ lang, screen, setScreen }) {
    const Crumb = ({ id, label }) => (
      <button onClick={() => setScreen(id)} style={{
        all: 'unset', cursor: 'pointer', padding: '10px 12px',
        fontSize: 12, fontWeight: 500, letterSpacing: '0.02em',
        color: screen === id ? 'var(--fg-strong)' : 'var(--fg-muted)',
        position: 'relative',
      }}>
        {label}
        {screen === id && <span style={{ position: 'absolute', bottom: -1, left: 12, right: 12, height: 2, background: 'var(--accent)' }}/>}
      </button>
    );
    return (
      <header style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center',
        padding: '0 24px', borderBottom: '1px solid var(--rule)',
        background: 'var(--surface-0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 4,
            background: 'var(--surface-2)',
            border: '1px solid var(--rule-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-strong)',
          }}><Icon name="spark2" size={14}/></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)', letterSpacing: '-0.005em' }}>
              Revenue OS
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
              {lang === 'ko' ? '소상공인 운영 OS' : 'Merchant Ops OS'}
            </span>
          </div>
          <div style={{
            marginLeft: 16, padding: '4px 10px', borderRadius: 4,
            background: 'var(--surface-2)', border: '1px solid var(--rule)',
            fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 6, alignItems: 'center',
          }}>
            <Icon name="dot" size={8}/>
            {S.area[lang]} · {S.category[lang]}
          </div>
        </div>
        <nav style={{ display: 'flex', justifyContent: 'center', borderBottom: 'none' }}>
          <Crumb id="brief"   label={tr('navBrief', lang)} />
          <Crumb id="evidence" label={tr('navEvidence', lang)} />
          <Crumb id="actions" label={tr('navActions', lang)} />
          <Crumb id="reliability" label={tr('navReliability', lang)} />
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fg-muted)' }}>
          <span className="mono">{tr('freshAsOf', lang)} {S.reliability.lastRun[lang]}</span>
        </div>
      </header>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // The big chart with cause annotations
  function HeroChart({ lang }) {
    const series = S.revSeries;
    const W = 760, H = 280;
    const pad = { l: 48, r: 24, t: 28, b: 40 };
    const min = 84, max = 104;
    const xs = series.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / (series.length - 1));
    const ys = series.map(p => pad.t + (1 - (p.v - min) / (max - min)) * (H - pad.t - pad.b));
    const linePath = series.map((_, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xs[xs.length-1]} ${H - pad.b} L ${xs[0]} ${H - pad.b} Z`;
    const last = series.length - 1;

    // y-axis ticks
    const ticks = [85, 90, 95, 100];

    // Cause annotations near the drop (between Q3 and Q4)
    const annotations = [
      { id: 'demand',      yFrac: 0.20, label: lang === 'ko' ? '생활인구 −8.4%' : 'Foot traffic −8.4%' },
      { id: 'weather',     yFrac: 0.45, label: lang === 'ko' ? '강수일수 +28%' : 'Rainy days +28%' },
      { id: 'competition', yFrac: 0.70, label: lang === 'ko' ? '점포수 +6.1%' : 'Stores +6.1%' },
    ];

    return (
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--rule)', borderRadius: 10,
        padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {lang === 'ko' ? '추정매출 지수 (2024 Q3 = 100)' : 'Estimated revenue index (2024 Q3 = 100)'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
              <span className="num" style={{ fontSize: 36, fontWeight: 600, color: 'var(--fg-strong)', letterSpacing: '-0.02em' }}>
                88.0
              </span>
              <span className="num" style={{ fontSize: 14, color: 'var(--bad-strong)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="arrow-down" size={13}/> {fmtPct(S.revenueChange)} {tr('vsBaseline', lang)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                {lang === 'ko' ? '· 거래건수 ' : '· Transactions '} <span className="num" style={{ color: 'var(--bad)' }}>{fmtPct(S.txnChange)}</span>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['8Q', '4Q', 'YoY'].map((b, i) => (
              <button key={b} style={{
                all: 'unset', cursor: 'pointer',
                padding: '5px 11px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                color: i === 0 ? 'var(--fg-strong)' : 'var(--fg-muted)',
                background: i === 0 ? 'var(--surface-2)' : 'transparent',
                border: i === 0 ? '1px solid var(--rule)' : '1px solid transparent',
              }}>{b}</button>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', marginTop: 8, display: 'block' }}>
          <defs>
            <linearGradient id="bArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* y-grid */}
          {ticks.map(t => {
            const y = pad.t + (1 - (t - min) / (max - min)) * (H - pad.t - pad.b);
            return (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--rule)" strokeDasharray={t === 100 ? '0' : '2 4'}/>
                <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--fg-dim)" className="mono">{t}</text>
              </g>
            );
          })}
          {/* x labels */}
          {series.map((p, i) => (
            <text key={i} x={xs[i]} y={H - pad.b + 16} fontSize="10" textAnchor="middle" fill="var(--fg-dim)" className="mono">
              {p.label}
            </text>
          ))}
          {/* baseline-to-compare drop band */}
          <rect x={xs[6]} y={pad.t} width={xs[7] - xs[6]} height={H - pad.t - pad.b} fill="var(--bad-soft)" opacity="0.5"/>
          {/* line + area */}
          <path d={areaPath} fill="url(#bArea)"/>
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {/* baseline marker */}
          <circle cx={xs[6]} cy={ys[6]} r="3.5" fill="var(--surface-1)" stroke="var(--accent)" strokeWidth="2"/>
          <text x={xs[6]} y={ys[6] - 12} textAnchor="middle" fontSize="10" fill="var(--fg-muted)" className="mono">
            {tr('baselineLabel', lang)}
          </text>
          {/* compare marker */}
          <circle cx={xs[7]} cy={ys[7]} r="4.5" fill="var(--bad-strong)"/>
          <line x1={xs[7]} x2={xs[7]} y1={ys[7] + 6} y2={H - pad.b - 4} stroke="var(--bad-strong)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
          {/* drop arrow callout */}
          <g>
            <line x1={xs[6] + 4} x2={xs[7] - 4} y1={(ys[6] + ys[7]) / 2 - 12} y2={(ys[6] + ys[7]) / 2 - 12} stroke="var(--bad-strong)" strokeWidth="1.2"/>
            <text x={(xs[6] + xs[7]) / 2} y={(ys[6] + ys[7]) / 2 - 16} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--bad-strong)" className="num">
              −12.0%
            </text>
          </g>
          {/* Cause annotation pins on the right edge */}
          {annotations.map((a, i) => {
            const ay = pad.t + a.yFrac * (H - pad.t - pad.b);
            return (
              <g key={a.id}>
                <line x1={xs[7] + 6} x2={W - pad.r - 130} y1={ys[7]} y2={ay} stroke="var(--rule-strong)" strokeWidth="1"/>
                <circle cx={W - pad.r - 130} cy={ay} r="3" fill="var(--accent)"/>
                <text x={W - pad.r - 122} y={ay + 3} fontSize="11" fill="var(--fg)" fontWeight="500">
                  {a.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // KPI rail
  function KpiRail({ lang }) {
    const items = [
      { lab: lang === 'ko' ? '추정매출' : 'Est. revenue',  v: '₩1,224M', d: S.revenueChange,    spark: S.revSeries },
      { lab: lang === 'ko' ? '거래건수' : 'Transactions',  v: '11.9k',   d: S.txnChange,        spark: [{v:100},{v:101},{v:99},{v:102},{v:104},{v:103},{v:100},{v:90}] },
      { lab: lang === 'ko' ? '객단가'   : 'Avg. ticket',   v: '₩6,450',  d: S.ticketChange,     spark: [{v:100},{v:99},{v:101},{v:102},{v:101},{v:100},{v:100},{v:98}] },
      { lab: lang === 'ko' ? '생활인구' : 'Foot traffic',  v: '142k',    d: S.populationChange, spark: [{v:104},{v:103},{v:102},{v:101},{v:101},{v:100},{v:100},{v:91.6}] },
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {items.map((m, i) => (
          <div key={i} style={{
            border: '1px solid var(--rule)', borderRadius: 10,
            padding: '14px 16px', background: 'var(--surface-1)',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.lab}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg-strong)' }}>{m.v}</span>
              <span className="num" style={{ fontSize: 12, color: m.d < 0 ? 'var(--bad-strong)' : 'var(--good-strong)', fontWeight: 600 }}>
                {fmtPct(m.d)}
              </span>
            </div>
            <div style={{ color: m.d < 0 ? 'var(--bad)' : 'var(--good)', marginTop: 2 }}>
              <Sparkline points={m.spark} width={200} height={32} fade="rgba(0,0,0,0.04)"/>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Evidence stack — attribution-style readout
  function EvidenceStack({ lang, setScreen }) {
    return (
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--rule)', borderRadius: 10,
        padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {tr('whyMaybe', lang)}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-strong)', marginTop: 4 }}>
              {tr('causeLabel', lang)} <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>· 4</span>
            </div>
          </div>
          <button onClick={() => setScreen('evidence')} style={{
            all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--accent-strong)',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
          }}>{tr('seeEvidence', lang)} <Icon name="arrow-right" size={12}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {S.causes.map((c, i) => {
            const widthPct = Math.min(100, Math.abs(c.delta) * 4 + 18);
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 14,
                padding: '12px 0', alignItems: 'center',
                borderTop: i ? '1px solid var(--rule)' : 'none',
              }}>
                <span style={{ color: 'var(--accent-strong)' }}><Icon name={c.icon} size={16}/></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{c.title[lang]}</span>
                    <span style={{ color: c.strength === 'strong' ? 'var(--accent-strong)' : c.strength === 'medium' ? 'var(--fg-muted)' : 'var(--fg-dim)' }}>
                      <StrengthDots level={c.strength}/>
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {tr('strength_' + c.strength, lang)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.headline[lang]}
                  </div>
                </div>
                <div style={{ width: 140, height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: widthPct + '%',
                    background: c.delta < 0 ? 'var(--bad)' : 'var(--accent)',
                    opacity: 0.85, borderRadius: 999,
                  }}/>
                </div>
                <span className="num" style={{ fontSize: 13, fontWeight: 600, width: 56, textAlign: 'right',
                  color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
                  {fmtPct(c.delta)}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 8,
          background: 'var(--surface-2)', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.55,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Icon name="shield" size={12}/>
          <span>{tr('disclaimer', lang)}</span>
        </div>
      </div>
    );
  }

  // Actions side rail (3 highlighted)
  function ActionsRail({ lang, setScreen }) {
    const top = S.actions.filter(a => a.timeframe === 'this-week').slice(0, 3);
    return (
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--rule)', borderRadius: 10,
        padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {tr('thisWeek', lang)}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg-strong)', marginTop: 4 }}>
              {lang === 'ko' ? '추천 액션 6개 중 3개' : '3 of 6 recommended'}
            </div>
          </div>
          <button onClick={() => setScreen('actions')} style={{
            all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--accent-strong)', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top.map((a, i) => (
            <div key={a.id} style={{
              border: '1px solid var(--rule)', borderRadius: 8,
              padding: '12px 14px', background: 'var(--surface-0)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div className="mono" style={{
                  width: 22, height: 22, fontSize: 11, color: 'var(--accent-strong)',
                  background: 'var(--accent-soft)', borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
                }}>0{i+1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{a.title[lang]}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.5 }}>{a.summary[lang]}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    <Pill tone="quiet" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
                    <Pill tone="quiet" size="sm">{tr('impact_' + a.impact, lang)}</Pill>
                    <span style={{ flex: 1 }}/>
                    <span style={{ display: 'inline-flex', gap: 3, color: 'var(--accent-strong)', opacity: 0.8 }}>
                      {a.tied.map(t => <Icon key={t} name={t} size={11}/>)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Brief({ lang, setScreen }) {
    return (
      <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Period strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
          border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--surface-1)',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--fg-muted)' }}>
            <Icon name="dot" size={9}/> {tr('compareLabel', lang)} <strong style={{ color: 'var(--fg-strong)' }}>{S.compare[lang]}</strong>
            &nbsp;{lang === 'ko' ? '대' : 'vs.'} {tr('baselineLabel', lang)} <strong style={{ color: 'var(--fg-strong)' }}>{S.base[lang]}</strong>
          </span>
          <span style={{ color: 'var(--fg-dim)' }}>·</span>
          <span style={{ color: 'var(--fg-muted)' }}>{S.area[lang]} · {S.category[lang]}</span>
          <span style={{ flex: 1 }}/>
          <Pill tone="bad" size="sm"><Icon name="arrow-down" size={11}/> {fmtPct(S.revenueChange)}</Pill>
          <Pill tone="good" size="sm"><Icon name="check" size={11}/> {tr('pipelineHealthy', lang)}</Pill>
        </div>

        {/* hero + side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <HeroChart lang={lang}/>
            <KpiRail lang={lang}/>
            <EvidenceStack lang={lang} setScreen={setScreen}/>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ActionsRail lang={lang} setScreen={setScreen}/>
            {/* Trust panel */}
            <div onClick={() => setScreen('reliability')} style={{
              cursor: 'pointer',
              border: '1px solid var(--rule)', borderRadius: 10,
              background: 'var(--surface-1)', padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6, background: 'var(--good-soft)',
                  color: 'var(--good-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon name="shield" size={13}/></span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{tr('trust', lang)}</div>
                <Pill tone="good" size="sm">{lang === 'ko' ? '양호' : 'Healthy'}</Pill>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                {S.reliability.sources.slice(0, 4).map(src => (
                  <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-muted)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%',
                      background: src.status === 'ok' ? 'var(--good)' : 'var(--warn)' }}/>
                    {src.name[lang]}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-dim)' }} className="mono">
                {tr('runs14', lang)} · {tr('freshAsOf', lang)} {S.reliability.lastRun[lang]}
              </div>
            </div>
            {/* Plain-language summary */}
            <div style={{
              border: '1px solid var(--rule)', borderRadius: 10,
              background: 'var(--surface-1)', padding: '16px 18px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {lang === 'ko' ? '한 줄 요약' : 'In one line'}
              </div>
              <p className="serif" style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--fg-strong)', margin: 0 }}>
                {lang === 'ko'
                  ? '4분기 매출이 12% 줄었습니다. 수요 감소·강수일 증가·점포수 증가가 함께 관측되었으며, 가능성 높은 원인 후보입니다.'
                  : 'Q4 revenue fell 12%. Softer foot traffic, more rain, and growing competitor count were observed together — likely cause candidates.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function Evidence({ lang }) {
    return (
      <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ maxWidth: 760 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--fg-strong)', letterSpacing: '-0.01em' }}>
            {tr('causeLabel', lang)}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 6 }}>
            {lang === 'ko'
              ? '매출 변화와 같은 기간에 함께 관측된 외부 신호들입니다. 원인을 확정하지 않으며, 추가 확인이 필요합니다.'
              : 'External signals observed during the same period as the revenue change. These are candidates, not proven causes — further confirmation is needed.'}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {S.causes.map((c, i) => (
            <div key={c.id} style={{
              border: '1px solid var(--rule)', borderRadius: 10,
              background: 'var(--surface-1)', padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 7, background: 'var(--surface-2)',
                  color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon name={c.icon} size={16}/></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                    0{i+1} · {tr('strength_' + c.strength, lang)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-strong)' }}>{c.title[lang]}</div>
                </div>
                <span className="num" style={{ fontSize: 18, fontWeight: 600,
                  color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
                  {fmtPct(c.delta)}
                </span>
              </div>
              <p className="serif" style={{ fontSize: 14, color: 'var(--fg)', margin: 0, fontStyle: 'italic', lineHeight: 1.4 }}>
                "{c.headline[lang]}"
              </p>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>{c.body[lang]}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {tr('howWeKnow', lang)}
                </span>
                {c.sources.map(src => <Pill key={src} tone="quiet" size="sm">{src}</Pill>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Actions board
  function Actions({ lang }) {
    const groups = [
      { key: 'this-week', label: tr('thisWeekTag', lang), tone: 'warm' },
      { key: 'next-2-weeks', label: tr('next2', lang), tone: 'neutral' },
      { key: 'next-month', label: tr('nextMonth', lang), tone: 'quiet' },
    ];
    return (
      <div style={{ padding: '24px 28px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--fg-strong)' }}>
              {tr('navActions', lang)}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 6, maxWidth: 600 }}>
              {lang === 'ko'
                ? '근거 후보에 연결된 6개의 추천 액션. 매출 회복을 보장하지 않습니다.'
                : 'Six recommendations tied to cause candidates. None guarantees revenue recovery.'}
            </p>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {S.actions.length} {lang === 'ko' ? '항목' : 'items'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 22 }}>
          {groups.map(g => {
            const items = S.actions.filter(a => a.timeframe === g.key);
            return (
              <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Pill tone={g.tone} size="sm">{g.label}</Pill>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{items.length}</span>
                </div>
                {items.map(a => (
                  <div key={a.id} style={{
                    border: '1px solid var(--rule)', borderRadius: 10,
                    background: 'var(--surface-1)', padding: '16px 18px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Pill tone="quiet" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
                      <Pill tone="quiet" size="sm">{tr('impact_' + a.impact, lang)}</Pill>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, color: 'var(--accent-strong)' }}>
                        {a.tied.map(t => <Icon key={t} name={t} size={12}/>)}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-strong)', lineHeight: 1.3 }}>
                      {a.title[lang]}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{a.summary[lang]}</div>
                    <ol style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 11, color: 'var(--fg)', lineHeight: 1.6 }}>
                      {a.steps.map((s, i) => <li key={i}>{s[lang]}</li>)}
                    </ol>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        color: '#fff', background: 'var(--accent-strong)',
                      }}>{tr('startAction', lang)}</button>
                      <button style={{
                        all: 'unset', cursor: 'pointer', padding: '6px 10px', fontSize: 12, color: 'var(--fg-muted)',
                      }}>{tr('saveForLater', lang)}</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function Reliability({ lang }) {
    return (
      <div style={{ padding: '24px 28px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--good-soft)',
            color: 'var(--good-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="shield" size={16}/></span>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--fg-strong)' }}>
            {tr('pipelineHealthy', lang)}
          </h1>
          <Pill tone="good" size="sm">{lang === 'ko' ? '양호' : 'Healthy'}</Pill>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          {lang === 'ko'
            ? '5개 데이터 소스 모두 예정된 주기로 갱신되었으며, 최근 14회 실행에서 실패가 없었습니다. 분석 단위는 상권/업종이며, 개별 매장 매출과 다를 수 있습니다.'
            : 'All 5 sources refreshed on schedule with zero failures in 14 runs. Analysis grain is trade-area / category — actual store revenue may differ.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 22 }}>
          {[
            { lab: lang === 'ko' ? '실행 횟수' : 'Runs',         v: '14', sub: lang === 'ko' ? '최근 30일' : 'last 30 d' },
            { lab: lang === 'ko' ? '실패 횟수' : 'Failures',     v: '0',  sub: lang === 'ko' ? '연속 정상' : 'streak' },
            { lab: lang === 'ko' ? '소스 정상' : 'Sources OK',   v: '4 / 5', sub: lang === 'ko' ? '1개 부분' : '1 partial' },
            { lab: lang === 'ko' ? '평균 신선도' : 'Avg. freshness', v: lang === 'ko' ? '2.1일' : '2.1 d', sub: lang === 'ko' ? '목표 < 7일' : 'target < 7 d' },
          ].map((m, i) => (
            <div key={i} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 16, background: 'var(--surface-1)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.lab}</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--fg-strong)', marginTop: 4 }}>{m.v}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 22, border: '1px solid var(--rule)', borderRadius: 10,
          background: 'var(--surface-1)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.5fr 0.9fr 1fr 1fr 0.8fr',
            padding: '12px 20px', fontSize: 11, color: 'var(--fg-muted)',
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
              display: 'grid', gridTemplateColumns: '1.5fr 0.9fr 1fr 1fr 0.8fr',
              padding: '14px 20px', alignItems: 'center', borderTop: '1px solid var(--rule)', fontSize: 13,
            }}>
              <span style={{ color: 'var(--fg-strong)', fontWeight: 500 }}>{src.name[lang]}</span>
              <span style={{ color: 'var(--fg-muted)' }}>{src.cadence[lang]}</span>
              <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{src.freshness}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 100, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: src.coverage + '%', height: '100%',
                    background: src.status === 'ok' ? 'var(--good)' : 'var(--warn)' }}/>
                </span>
                <span className="num" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{src.coverage}%</span>
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
    );
  }

  function DirectionB() {
    const [lang, setLang] = useState('ko');
    const [theme, setTheme] = useState('light');
    const [screen, setScreen] = useState('brief');
    const effective = theme === 'system' ? 'light' : theme;
    return (
      <>
        <style>{themeCSS}</style>
        <div className="dirB" data-theme={effective} data-screen-label={`B · ${screen}`} style={{ minHeight: '100%' }}>
          <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
            label={lang === 'ko' ? 'B · 근거 기반 프리미엄 대시보드' : 'B · Evidence-backed Premium Dashboard'}/>
          <Header lang={lang} screen={screen} setScreen={setScreen}/>
          {screen === 'brief'       && <Brief lang={lang} setScreen={setScreen}/>}
          {screen === 'evidence'    && <Evidence lang={lang}/>}
          {screen === 'actions'     && <Actions lang={lang}/>}
          {screen === 'reliability' && <Reliability lang={lang}/>}
        </div>
      </>
    );
  }
  window.DirectionB = DirectionB;
})();
