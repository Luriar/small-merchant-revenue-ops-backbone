// direction-a.jsx — "Merchant Revenue Cockpit"
// Story-led split layout. Left: editorial narrative ("what happened, why").
// Right: evidence stack + this-week actions. Calm, confident, premium.

(function () {
  const { useState } = React;
  const { SCENARIO: S, tr, Sparkline, Icon, Pill, StrengthDots, fmtPct, ChromeBar } = window;

  // Theme tokens — direction A: warm paper + ink, single amber accent
  const themeCSS = `
    .dirA{
      --bg: #f4efe7;
      --surface-0: #faf7f1;
      --surface-1: #ffffff;
      --surface-2: #f0eadf;
      --fg: #1f1b16;
      --fg-strong: #0d0b08;
      --fg-muted: #6b6258;
      --fg-dim: #9a9087;
      --rule: rgba(40,30,20,0.10);
      --rule-strong: rgba(40,30,20,0.18);
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
      --chip-bg: #efe9dd;
      --chip-fg: #4a4239;
      --chip-bd: rgba(40,30,20,0.10);
      --serif: 'Source Serif 4', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dirA[data-theme="dark"]{
      --bg: #14110d;
      --surface-0: #1b1814;
      --surface-1: #221e19;
      --surface-2: #2a251f;
      --fg: #ece6db;
      --fg-strong: #fbf6ec;
      --fg-muted: #a39686;
      --fg-dim: #6e6357;
      --rule: rgba(255,240,220,0.10);
      --rule-strong: rgba(255,240,220,0.18);
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
      --chip-bg: #2a251f;
      --chip-fg: #c8bca9;
      --chip-bd: rgba(255,240,220,0.12);
    }
    .dirA{ background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 14px; line-height: 1.5; }
    .dirA *{ box-sizing: border-box; }
    .dirA .serif{ font-family: var(--serif); font-feature-settings: "ss01","ss02"; }
    .dirA .mono{ font-family: var(--mono); font-feature-settings: "tnum"; }
    .dirA .num{ font-variant-numeric: tabular-nums; }
    .dirA button{ font-family: inherit; }
    .dirA-shell{ display: grid; grid-template-rows: auto auto 1fr; min-height: 100%; }
  `;

  // ─────────────────────────────────────────────────────────────────
  function Header({ lang, screen, setScreen }) {
    const Crumb = ({ id, label }) => (
      <button onClick={() => setScreen(id)} style={{
        all: 'unset', cursor: 'pointer', padding: '8px 14px',
        fontSize: 13, fontWeight: 500,
        color: screen === id ? 'var(--fg-strong)' : 'var(--fg-muted)',
        borderBottom: screen === id ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1,
      }}>{label}</button>
    );
    return (
      <header style={{
        display: 'flex', alignItems: 'flex-end', gap: 24,
        padding: '14px 32px 0',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--surface-0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon name="flag" size={13}/>
          </div>
          <span className="serif" style={{ fontSize: 17, letterSpacing: '-0.01em', color: 'var(--fg-strong)' }}>
            Revenue&nbsp;<span style={{ fontStyle: 'italic', color: 'var(--accent-strong)' }}>OS</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', borderLeft: '1px solid var(--rule)', paddingLeft: 10, marginLeft: 4 }}>
            {S.area[lang]} · {S.category[lang]}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <Crumb id="brief"   label={tr('navBrief', lang)} />
          <Crumb id="evidence" label={tr('navEvidence', lang)} />
          <Crumb id="actions" label={tr('navActions', lang)} />
          <Crumb id="reliability" label={tr('navReliability', lang)} />
        </nav>
      </header>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // BRIEF — split pane
  function Brief({ lang, setScreen }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 0, minHeight: '100%' }}>
        {/* LEFT — narrative */}
        <section style={{
          padding: '40px 44px 56px',
          borderRight: '1px solid var(--rule)',
          background: 'var(--surface-0)',
          position: 'relative',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11,
            color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <Icon name="dot" size={10}/>
            {lang === 'ko' ? '이번 분기 매출 브리프' : 'This quarter — Revenue Brief'}
          </div>

          <h1 className="serif" style={{
            fontSize: 56, lineHeight: 1.05, letterSpacing: '-0.025em',
            margin: '20px 0 18px', color: 'var(--fg-strong)', fontWeight: 400, textWrap: 'pretty',
          }}>
            {lang === 'ko'
              ? <>2024년 4분기 추정매출이 직전 분기 대비 <span style={{ color: 'var(--accent-strong)' }}>12.0%</span> 줄었습니다.</>
              : <>Estimated revenue fell <span style={{ color: 'var(--accent-strong)' }}>12.0%</span> from the prior quarter.</>}
          </h1>

          <p style={{ fontSize: 16, color: 'var(--fg-muted)', maxWidth: 540, margin: '0 0 28px', lineHeight: 1.6 }}>
            {lang === 'ko'
              ? '거래건수 감소와 함께 관측되었습니다. 같은 기간 생활인구가 줄고 강수일수와 인근 점포수가 늘었습니다. 가능성 높은 원인 후보를 아래에서 확인해주세요.'
              : 'Transaction count fell alongside revenue. Foot traffic softened, rainy days rose, and nearby café count grew. Likely cause candidates below.'}
          </p>

          {/* The big number block */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            border: '1px solid var(--rule)', borderRadius: 12,
            background: 'var(--surface-1)', overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 22px', borderRight: '1px solid var(--rule)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {tr('compareLabel', lang)} · {S.compare[lang]}
              </div>
              <div className="num serif" style={{ fontSize: 42, lineHeight: 1.1, color: 'var(--fg-strong)', marginTop: 6, fontWeight: 400 }}>
                ₩ 1,224<span style={{ fontSize: 22, color: 'var(--fg-muted)' }}>M</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--bad-strong)', fontSize: 13, fontWeight: 600 }}>
                <Icon name="arrow-down" size={14}/> {fmtPct(S.revenueChange)} {tr('vsBaseline', lang)}
              </div>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {lang === 'ko' ? '8개 분기 추이' : 'Trailing 8 quarters'}
              </div>
              <div style={{ color: 'var(--accent)' }}>
                <Sparkline points={S.revSeries} width={260} height={64} dropFrom={6} fade="rgba(184,84,42,0.10)"/>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', display: 'flex', justifyContent: 'space-between' }}>
                <span>23Q1</span><span>{S.compare[lang === 'ko' ? 'en' : 'en']}</span>
              </div>
            </div>
          </div>

          {/* Three secondary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 24 }}>
            {[
              { lab: lang === 'ko' ? '거래건수' : 'Transactions', v: '11.9k', d: S.txnChange },
              { lab: lang === 'ko' ? '객단가' : 'Avg. ticket', v: '₩ 6,450', d: S.ticketChange },
              { lab: lang === 'ko' ? '생활인구' : 'Foot traffic', v: '142k', d: S.populationChange },
            ].map((m, i) => (
              <div key={i} style={{ padding: '14px 18px', borderLeft: i ? '1px solid var(--rule)' : 'none' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{m.lab}</div>
                <div className="num serif" style={{ fontSize: 22, color: 'var(--fg-strong)', marginTop: 4 }}>{m.v}</div>
                <div className="num" style={{ fontSize: 12, marginTop: 2,
                  color: m.d < 0 ? 'var(--bad-strong)' : 'var(--good-strong)' }}>{fmtPct(m.d)}</div>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 32, fontSize: 12, color: 'var(--fg-dim)', maxWidth: 480, lineHeight: 1.55 }}>
            <Icon name="shield" size={11}/> &nbsp;{tr('estimatedNote', lang)}.&nbsp;
            <a onClick={() => setScreen('reliability')} style={{ color: 'var(--accent-strong)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
              {tr('navReliability', lang)} →
            </a>
          </p>
        </section>

        {/* RIGHT — modules */}
        <section style={{ padding: '40px 36px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Why — top 3 causes */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 className="serif" style={{ fontSize: 20, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
                {tr('whyMaybe', lang)}
              </h2>
              <button onClick={() => setScreen('evidence')} style={{
                all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--accent-strong)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>{tr('seeEvidence', lang)} <Icon name="arrow-right" size={12}/></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
              {lang === 'ko' ? '4개 후보 중 신호가 강한 3개를 먼저 보여드려요.' : 'Three of four candidates surfaced — strongest signals first.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {S.causes.slice(0, 3).map((c, i) => <CauseRow key={c.id} c={c} lang={lang} rank={i+1}/>)}
            </div>
          </div>

          {/* What to try this week */}
          <div style={{
            border: '1px solid var(--accent-soft-bd)',
            background: 'var(--accent-soft)', borderRadius: 12, padding: '20px 22px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="serif" style={{ fontSize: 20, fontWeight: 500, margin: 0, color: 'var(--accent-strong)' }}>
                {tr('thisWeek', lang)}
              </h2>
              <Pill tone="warm" size="sm">3 / 6</Pill>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {S.actions.filter(a => a.timeframe === 'this-week').slice(0, 3).map((a, i) => (
                <ActionRow key={a.id} a={a} lang={lang} idx={i+1}/>
              ))}
            </div>
            <button onClick={() => setScreen('actions')} style={{
              all: 'unset', cursor: 'pointer', marginTop: 14, fontSize: 12,
              color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
          </div>

          {/* Trust strip */}
          <div onClick={() => setScreen('reliability')} style={{
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 10,
            border: '1px solid var(--rule)', background: 'var(--surface-1)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--good-soft)', color: 'var(--good-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Icon name="check" size={14}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-strong)' }}>
                {tr('pipelineHealthy', lang)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                5/5 sources · {tr('runs14', lang)} · {tr('freshAsOf', lang)} {S.reliability.lastRun[lang]}
              </div>
            </div>
            <Icon name="arrow-right" size={14}/>
          </div>
        </section>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function CauseRow({ c, lang, rank }) {
    const [open, setOpen] = useState(false);
    return (
      <div style={{
        border: '1px solid var(--rule)', borderRadius: 10,
        background: 'var(--surface-1)', overflow: 'hidden',
      }}>
        <button onClick={() => setOpen(o => !o)} style={{
          all: 'unset', cursor: 'pointer', display: 'grid',
          gridTemplateColumns: 'auto 1fr auto', gap: 14,
          padding: '13px 16px', alignItems: 'center', width: '100%',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--surface-2)', color: 'var(--accent-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name={c.icon} size={16}/></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }} className="mono">0{rank}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-strong)' }}>{c.title[lang]}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.headline[lang]}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className="num" style={{ fontSize: 13, fontWeight: 600,
              color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
              {fmtPct(c.delta)}
            </span>
            <span style={{ color: c.strength === 'strong' ? 'var(--accent-strong)' : c.strength === 'medium' ? 'var(--fg-muted)' : 'var(--fg-dim)' }}>
              <StrengthDots level={c.strength}/>
            </span>
          </div>
        </button>
        {open && (
          <div style={{ padding: '0 16px 14px 62px', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 8px' }}>{c.body[lang]}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {c.sources.map(src => <Pill key={src} tone="quiet" size="sm">{src}</Pill>)}
              <Pill tone="quiet" size="sm">{tr('observedTogether', lang)}</Pill>
            </div>
          </div>
        )}
      </div>
    );
  }

  function ActionRow({ a, lang, idx }) {
    return (
      <div style={{
        background: 'var(--surface-1)', borderRadius: 10,
        border: '1px solid var(--rule)',
        padding: '13px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
      }}>
        <div className="serif num" style={{
          width: 28, height: 28, fontSize: 16, color: 'var(--accent-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{idx}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{a.title[lang]}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{a.summary[lang]}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Pill tone="quiet" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
            <Pill tone="quiet" size="sm">{tr('impact_' + a.impact, lang)}</Pill>
          </div>
        </div>
        <button style={{
          all: 'unset', cursor: 'pointer',
          padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
          color: 'var(--surface-0)', background: 'var(--accent-strong)',
          whiteSpace: 'nowrap',
        }}>{tr('startAction', lang)}</button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // EVIDENCE — full 4 candidates in detail
  function Evidence({ lang }) {
    const [active, setActive] = useState(S.causes[0].id);
    const c = S.causes.find(x => x.id === active);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: '100%' }}>
        <aside style={{
          borderRight: '1px solid var(--rule)', padding: '32px 0',
          background: 'var(--surface-0)',
        }}>
          <div style={{ padding: '0 28px 16px' }}>
            <div className="serif" style={{ fontSize: 24, color: 'var(--fg-strong)', fontWeight: 500 }}>
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
              padding: '14px 28px', width: '100%',
              borderLeft: active === cs.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: active === cs.id ? 'var(--surface-2)' : 'transparent',
            }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>0{i+1}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-strong)' }}>{cs.title[lang]}</span>
              <span style={{ color: 'var(--fg-muted)' }}><StrengthDots level={cs.strength}/></span>
            </button>
          ))}
        </aside>
        <main style={{ padding: '40px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
            <Icon name={c.icon} size={12}/> {tr('strength_' + c.strength, lang)} · {tr('observedTogether', lang)}
          </div>
          <h1 className="serif" style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 400, margin: '14px 0 6px', color: 'var(--fg-strong)' }}>
            {c.title[lang]}
          </h1>
          <p className="serif" style={{ fontSize: 19, lineHeight: 1.45, color: 'var(--fg)', margin: '0 0 18px', fontStyle: 'italic', maxWidth: 680 }}>
            "{c.headline[lang]}"
          </p>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', maxWidth: 680, lineHeight: 1.65 }}>{c.body[lang]}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28, maxWidth: 680 }}>
            <DataCard
              label={lang === 'ko' ? '관측값' : 'Observed delta'}
              value={fmtPct(c.delta)}
              series={[{v:0},{v:-1},{v:-2.5},{v:-4},{v:-6},{v:-7.5},{v:c.delta < 0 ? c.delta : c.delta * 0.9},{v:c.delta}]}
              danger={c.delta < 0}
            />
            <div style={{
              padding: 16, border: '1px solid var(--rule)', borderRadius: 10,
              background: 'var(--surface-1)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {tr('howWeKnow', lang)}
              </div>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>
                {c.sources.map(src => (
                  <li key={src} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Icon name="dot" size={8}/> {src}
                  </li>
                ))}
                <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="dot" size={8}/> {tr('mayHaveContrib', lang)}
                </li>
              </ul>
            </div>
          </div>

          <div style={{
            marginTop: 28, padding: '14px 18px', borderRadius: 10,
            background: 'var(--surface-2)', fontSize: 12, color: 'var(--fg-muted)', maxWidth: 680, lineHeight: 1.6,
          }}>
            <Icon name="shield" size={12}/> &nbsp; {tr('disclaimer', lang)}
          </div>
        </main>
      </div>
    );
  }

  function DataCard({ label, value, series, danger }) {
    return (
      <div style={{
        padding: 16, border: '1px solid var(--rule)', borderRadius: 10,
        background: 'var(--surface-1)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div className="num serif" style={{ fontSize: 32, color: danger ? 'var(--bad-strong)' : 'var(--good-strong)', marginTop: 4, fontWeight: 400 }}>{value}</div>
        <div style={{ marginTop: 6, color: danger ? 'var(--bad)' : 'var(--good)' }}>
          <Sparkline points={series} width={220} height={40} fade="rgba(0,0,0,0.04)"/>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // ACTIONS
  function Actions({ lang }) {
    const buckets = [
      { key: 'this-week', label: tr('thisWeekTag', lang) },
      { key: 'next-2-weeks', label: tr('next2', lang) },
      { key: 'next-month', label: tr('nextMonth', lang) },
    ];
    return (
      <div style={{ padding: '40px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', maxWidth: 1100 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 32, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {tr('thisWeek', lang)}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 6, maxWidth: 560 }}>
              {lang === 'ko'
                ? '근거 후보에 연결된 6가지 추천 액션입니다. 매출 회복을 보장하지는 않습니다 — 검토 후 시작해보세요.'
                : 'Six actions tied to the cause candidates. They don\'t guarantee revenue recovery — review and pick what fits.'}
            </p>
          </div>
          <Pill tone="warm">{lang === 'ko' ? '6개 추천' : '6 recommended'}</Pill>
        </div>

        {buckets.map(b => {
          const items = S.actions.filter(a => a.timeframe === b.key);
          if (!items.length) return null;
          return (
            <div key={b.key} style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{b.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--rule)' }}/>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {items.map(a => <ActionCard key={a.id} a={a} lang={lang}/>)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function ActionCard({ a, lang }) {
    const [done, setDone] = useState(false);
    return (
      <div style={{
        border: '1px solid var(--rule)', borderRadius: 12,
        background: 'var(--surface-1)', padding: '18px 18px 16px',
        display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
        opacity: done ? 0.6 : 1, transition: 'opacity .15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone="warm" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
          <Pill tone="quiet" size="sm">{tr('impact_' + a.impact, lang)}</Pill>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: 'var(--fg-dim)' }}>
            {a.tied.map(t => <span key={t} title={t} style={{ color: 'var(--accent-strong)' }}><Icon name={t} size={12}/></span>)}
          </span>
        </div>
        <div className="serif" style={{ fontSize: 18, lineHeight: 1.3, color: 'var(--fg-strong)', fontWeight: 500 }}>
          {a.title[lang]}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          {a.summary[lang]}
        </div>
        <ol style={{ margin: '4px 0 6px', padding: '0 0 0 18px', fontSize: 12, color: 'var(--fg)', lineHeight: 1.6 }}>
          {a.steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s[lang]}</li>)}
        </ol>
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button onClick={() => setDone(d => !d)} style={{
            all: 'unset', cursor: 'pointer',
            padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            color: done ? 'var(--good-strong)' : 'var(--surface-0)',
            background: done ? 'var(--good-soft)' : 'var(--accent-strong)',
            border: done ? '1px solid var(--good-soft-bd)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {done ? <><Icon name="check" size={12}/> {lang === 'ko' ? '시작함' : 'Started'}</> : tr('startAction', lang)}
          </button>
          <button style={{
            all: 'unset', cursor: 'pointer', padding: '8px 12px', fontSize: 12,
            color: 'var(--fg-muted)', borderRadius: 7,
          }}>{tr('saveForLater', lang)}</button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RELIABILITY
  function Reliability({ lang }) {
    return (
      <div style={{ padding: '40px 48px' }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--good-soft)', color: 'var(--good-strong)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={16}/></span>
            <h1 className="serif" style={{ fontSize: 32, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {tr('pipelineHealthy', lang)}
            </h1>
          </div>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.6 }}>
            {lang === 'ko'
              ? '모든 데이터 소스가 예정된 주기로 갱신되었으며, 최근 14회 실행에서 실패가 없었습니다. 출력은 공공데이터 기반 추정치이며, 실제 매장 매출과 다를 수 있습니다.'
              : 'All sources refreshed on schedule with zero failures in the last 14 runs. Outputs are public-data estimates and may differ from actual store revenue.'}
          </p>
        </div>

        <div style={{
          marginTop: 28, border: '1px solid var(--rule)', borderRadius: 12,
          background: 'var(--surface-1)', overflow: 'hidden', maxWidth: 980,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.9fr 1fr 0.8fr',
            padding: '12px 20px', fontSize: 11, color: 'var(--fg-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            borderBottom: '1px solid var(--rule)',
          }}>
            <span>{lang === 'ko' ? '데이터 소스' : 'Source'}</span>
            <span>{tr('cadence', lang)}</span>
            <span>{tr('freshAsOf', lang)}</span>
            <span>{tr('coverage', lang)}</span>
            <span style={{ textAlign: 'right' }}>{lang === 'ko' ? '상태' : 'Status'}</span>
          </div>
          {S.reliability.sources.map(src => (
            <div key={src.id} style={{
              display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.9fr 1fr 0.8fr',
              padding: '14px 20px', alignItems: 'center', borderTop: '1px solid var(--rule)', fontSize: 13,
            }}>
              <span style={{ color: 'var(--fg-strong)', fontWeight: 500 }}>{src.name[lang]}</span>
              <span style={{ color: 'var(--fg-muted)' }}>{src.cadence[lang]}</span>
              <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{src.freshness}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: src.coverage + '%', height: '100%',
                    background: src.status === 'ok' ? 'var(--good)' : 'var(--accent)' }}/>
                </span>
                <span className="num" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{src.coverage}%</span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <Pill tone={src.status === 'ok' ? 'good' : 'warm'} size="sm">
                  {src.status === 'ok'
                    ? (lang === 'ko' ? '정상' : 'OK')
                    : (lang === 'ko' ? '부분' : 'Partial')}
                </Pill>
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 24, maxWidth: 980 }}>
          {[
            { lab: lang === 'ko' ? '최근 실행' : 'Recent runs', v: '14', sub: lang === 'ko' ? '실패 0' : '0 failures' },
            { lab: lang === 'ko' ? '마지막 갱신' : 'Last refresh', v: S.reliability.lastRun[lang], sub: lang === 'ko' ? '예정대로' : 'On schedule' },
            { lab: lang === 'ko' ? '분석 단위' : 'Analysis grain', v: lang === 'ko' ? '상권·업종' : 'Trade-area · Category', sub: lang === 'ko' ? '매장 단위 아님' : 'Not per-store' },
          ].map((m, i) => (
            <div key={i} style={{
              border: '1px solid var(--rule)', borderRadius: 10, padding: 16, background: 'var(--surface-1)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.lab}</div>
              <div className="serif" style={{ fontSize: 22, color: 'var(--fg-strong)', marginTop: 4 }}>{m.v}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  function DirectionA() {
    const [lang, setLang] = useState('ko');
    const [theme, setTheme] = useState('light');
    const [screen, setScreen] = useState('brief');
    const effective = theme === 'system' ? 'light' : theme; // canvas always light-bg; preview-only
    return (
      <>
        <style>{themeCSS}</style>
        <div className="dirA" data-theme={effective} data-screen-label={`A · ${screen}`} style={{ minHeight: '100%' }}>
          <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
            label={lang === 'ko' ? 'A · 매출 코크핏' : 'A · Revenue Cockpit'}/>
          <Header lang={lang} screen={screen} setScreen={setScreen}/>
          <div>
            {screen === 'brief'       && <Brief lang={lang} setScreen={setScreen}/>}
            {screen === 'evidence'    && <Evidence lang={lang}/>}
            {screen === 'actions'     && <Actions lang={lang}/>}
            {screen === 'reliability' && <Reliability lang={lang}/>}
          </div>
        </div>
      </>
    );
  }

  window.DirectionA = DirectionA;
})();
