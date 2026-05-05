// direction-c.jsx — "Action-first Small Business Assistant"
// Friendly weekly-plan hero. The Revenue Brief reads as a personal
// briefing: "this week, here's the situation, here's what to try."
// Cream + sage, conversational, still calm and grown-up.

(function () {
  const { useState } = React;
  const { SCENARIO: S, tr, Sparkline, Icon, Pill, StrengthDots, fmtPct, ChromeBar } = window;

  const themeCSS = `
    .dirC{
      --bg: #efeae0;
      --surface-0: #f8f3e8;
      --surface-1: #fffaf0;
      --surface-2: #ebe3d3;
      --fg: #1d1c17;
      --fg-strong: #0a0908;
      --fg-muted: #6a655b;
      --fg-dim: #948e83;
      --rule: rgba(40,34,22,0.10);
      --rule-strong: rgba(40,34,22,0.18);
      --accent: #4a6a3f;
      --accent-strong: #344b2c;
      --accent-soft: #e2e8d4;
      --accent-soft-bd: rgba(74,106,63,0.20);
      --good: #4a6a3f;
      --good-strong: #344b2c;
      --good-soft: #e2e8d4;
      --good-soft-bd: rgba(74,106,63,0.20);
      --bad: #a64a2a;
      --bad-strong: #7d3318;
      --bad-soft: #f1dcce;
      --bad-soft-bd: rgba(166,74,42,0.20);
      --chip-bg: #ebe3d3;
      --chip-fg: #4a4438;
      --chip-bd: rgba(40,34,22,0.10);
      --serif: 'Source Serif 4', 'Iowan Old Style', Georgia, serif;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .dirC[data-theme="dark"]{
      --bg: #131210;
      --surface-0: #1a1815;
      --surface-1: #21201c;
      --surface-2: #2a2823;
      --fg: #ece8de;
      --fg-strong: #fbf7eb;
      --fg-muted: #a39c8c;
      --fg-dim: #706a5d;
      --rule: rgba(240,232,210,0.10);
      --rule-strong: rgba(240,232,210,0.18);
      --accent: #92b380;
      --accent-strong: #b1cf9d;
      --accent-soft: rgba(146,179,128,0.14);
      --accent-soft-bd: rgba(146,179,128,0.30);
      --good: #92b380;
      --good-strong: #b1cf9d;
      --good-soft: rgba(146,179,128,0.14);
      --good-soft-bd: rgba(146,179,128,0.30);
      --bad: #d97f5f;
      --bad-strong: #ea957a;
      --bad-soft: rgba(217,127,95,0.14);
      --bad-soft-bd: rgba(217,127,95,0.28);
      --chip-bg: #2a2823;
      --chip-fg: #c9c0ad;
      --chip-bd: rgba(240,232,210,0.12);
    }
    .dirC{ background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 14px; line-height: 1.55; }
    .dirC *{ box-sizing: border-box; }
    .dirC .serif{ font-family: var(--serif); }
    .dirC .mono{ font-family: var(--mono); font-feature-settings: "tnum"; }
    .dirC .num{ font-variant-numeric: tabular-nums; }
    .dirC button{ font-family: inherit; }
  `;

  function Header({ lang, screen, setScreen }) {
    const tabs = [
      { id: 'brief',       label: tr('navBrief', lang),       icon: 'flag' },
      { id: 'evidence',    label: tr('navEvidence', lang),    icon: 'spark2' },
      { id: 'actions',     label: tr('navActions', lang),     icon: 'check' },
      { id: 'reliability', label: tr('navReliability', lang), icon: 'shield' },
    ];
    return (
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--surface-0)',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--surface-1)',
          }}><Icon name="spark2" size={16}/></div>
          <div>
            <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-strong)', letterSpacing: '-0.005em' }}>
              {lang === 'ko' ? '오늘의 매출 도우미' : 'Your Revenue Assistant'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
              {S.area[lang]} · {S.category[lang]} · {S.compare[lang]}
            </div>
          </div>
        </div>
        <nav style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setScreen(t.id)} style={{
              all: 'unset', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
              color: screen === t.id ? 'var(--surface-1)' : 'var(--fg-muted)',
              background: screen === t.id ? 'var(--accent-strong)' : 'transparent',
            }}>
              <Icon name={t.icon} size={13}/> {t.label}
            </button>
          ))}
        </nav>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }} className="mono">
          {tr('freshAsOf', lang)} {S.reliability.lastRun[lang]}
        </div>
      </header>
    );
  }

  // BRIEF — friendly briefing card + weekly plan + supporting context
  function Brief({ lang, setScreen }) {
    return (
      <div style={{ padding: '28px 32px 48px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'flex-start' }}>
        {/* MAIN COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* The brief card — feels like a written letter */}
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--rule)', borderRadius: 16,
            padding: '32px 36px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
              color: 'var(--accent-strong)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              <Icon name="dot" size={9}/> {lang === 'ko' ? '이번 주 브리프' : 'This week\'s briefing'}
            </div>
            <h1 className="serif" style={{
              fontSize: 38, lineHeight: 1.18, letterSpacing: '-0.015em',
              fontWeight: 500, margin: '14px 0 16px', color: 'var(--fg-strong)', textWrap: 'pretty', maxWidth: 720,
            }}>
              {lang === 'ko'
                ? <>지난 분기 매출이 <span style={{ color: 'var(--bad-strong)' }}>12% 줄었어요</span>. 이번 주에 시도할 만한 3가지를 추렸습니다.</>
                : <>Revenue dipped <span style={{ color: 'var(--bad-strong)' }}>12% last quarter</span>. Here are three things worth trying this week.</>}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--fg-muted)', maxWidth: 640, margin: 0, lineHeight: 1.65 }}>
              {lang === 'ko'
                ? '비 오는 날이 많았고, 동네 카페 수가 늘었으며, 평일 유동인구가 살짝 줄었습니다. 단정 짓긴 어렵지만, 이 세 가지가 영향을 주었을 가능성이 있어요.'
                : 'It rained more, a few new cafés opened nearby, and weekday foot traffic softened a bit. Hard to pin down for sure, but these three factors may have contributed.'}
            </p>

            {/* tiny number row */}
            <div style={{ display: 'flex', gap: 28, marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--rule)' }}>
              {[
                { lab: lang === 'ko' ? '추정매출' : 'Revenue',      v: '₩1,224M', d: S.revenueChange },
                { lab: lang === 'ko' ? '거래건수' : 'Transactions', v: '11.9k',   d: S.txnChange },
                { lab: lang === 'ko' ? '단골 방문' : 'Regulars',    v: '38%',     d: -3.5 },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.lab}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span className="serif num" style={{ fontSize: 24, color: 'var(--fg-strong)' }}>{m.v}</span>
                    <span className="num" style={{ fontSize: 12, fontWeight: 600,
                      color: m.d < 0 ? 'var(--bad-strong)' : 'var(--good-strong)' }}>{fmtPct(m.d)}</span>
                  </div>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', color: 'var(--accent)' }}>
                <Sparkline points={S.revSeries} width={180} height={48} dropFrom={6} fade="rgba(74,106,63,0.10)"/>
              </div>
            </div>
          </div>

          {/* Weekly plan */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
                {lang === 'ko' ? '이번 주 플랜' : 'Your week, mapped out'}
              </h2>
              <button onClick={() => setScreen('actions')} style={{
                all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--accent-strong)',
                display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
              }}>{tr('seeAllActions', lang)} <Icon name="arrow-right" size={12}/></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {S.actions.filter(a => a.timeframe === 'this-week').slice(0, 3).map((a, i) => (
                <PlanCard key={a.id} a={a} lang={lang} day={['MON','WED','FRI'][i]} dayKo={['월','수','금'][i]}/>
              ))}
            </div>
          </div>
        </div>

        {/* SIDE COLUMN */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
          {/* Why might it have happened — friendly */}
          <div style={{
            background: 'var(--surface-1)', border: '1px solid var(--rule)',
            borderRadius: 14, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icon name="spark2" size={14}/>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                {tr('whyMaybe', lang)}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 14px', lineHeight: 1.55 }}>
              {lang === 'ko' ? '함께 관측된 신호 4가지:' : 'Four signals observed alongside the dip:'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {S.causes.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name={c.icon} size={14}/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-strong)' }}>{c.title[lang]}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="num" style={{ fontSize: 11, color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)', fontWeight: 600 }}>
                        {fmtPct(c.delta)}
                      </span>
                      <span style={{ color: 'var(--fg-muted)' }}><StrengthDots level={c.strength}/></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setScreen('evidence')} style={{
              all: 'unset', cursor: 'pointer', marginTop: 14, fontSize: 12, color: 'var(--accent-strong)',
              display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
            }}>{tr('seeEvidence', lang)} <Icon name="arrow-right" size={12}/></button>
          </div>

          {/* Trust */}
          <div onClick={() => setScreen('reliability')} style={{
            cursor: 'pointer',
            background: 'var(--good-soft)',
            border: '1px solid var(--good-soft-bd)', borderRadius: 14,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: 'var(--good-strong)' }}><Icon name="check" size={14}/></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--good-strong)' }}>
                {lang === 'ko' ? '데이터 상태 양호해요' : 'Data looks reliable'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--good-strong)', opacity: 0.85, lineHeight: 1.55 }}>
              {lang === 'ko'
                ? '5개 소스 모두 예정대로 갱신 · 최근 14회 실행 실패 0'
                : 'All 5 sources fresh · 14 runs, 0 failures'}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{
            border: '1px dashed var(--rule-strong)', borderRadius: 14,
            padding: '12px 16px', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.6,
          }}>
            <Icon name="shield" size={11}/> &nbsp; {tr('disclaimer', lang)}
          </div>
        </aside>
      </div>
    );
  }

  function PlanCard({ a, lang, day, dayKo }) {
    const [done, setDone] = useState(false);
    return (
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--rule)',
        borderRadius: 14, padding: '18px 20px',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'flex-start',
      }}>
        {/* Day chip */}
        <div style={{
          width: 56, padding: '10px 0', borderRadius: 10,
          background: done ? 'var(--good-soft)' : 'var(--surface-2)',
          textAlign: 'center', flexShrink: 0,
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
            {lang === 'ko' ? '요일' : 'When'}
          </div>
          <div className="serif" style={{ fontSize: 18, color: done ? 'var(--good-strong)' : 'var(--fg-strong)', fontWeight: 600, marginTop: 2 }}>
            {lang === 'ko' ? dayKo : day}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <Pill tone="warm" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
            <Pill tone="quiet" size="sm">{tr('impact_' + a.impact, lang)}</Pill>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, color: 'var(--fg-dim)' }}>
              <Icon name="dot" size={6}/>
              {lang === 'ko' ? '근거' : 'tied to'}
              {a.tied.map(t => <span key={t} style={{ color: 'var(--accent-strong)' }}><Icon name={t} size={11}/></span>)}
            </span>
          </div>
          <div className="serif" style={{ fontSize: 18, fontWeight: 500, color: 'var(--fg-strong)', lineHeight: 1.3 }}>
            {a.title[lang]}
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '6px 0 10px', lineHeight: 1.55 }}>
            {a.summary[lang]}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {a.steps.map((s, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--fg)', padding: '4px 0',
              }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{i+1}</span>
                {s[lang]}
                {i < a.steps.length - 1 && <span style={{ color: 'var(--fg-dim)', marginLeft: 4 }}>·</span>}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <button onClick={() => setDone(d => !d)} style={{
            all: 'unset', cursor: 'pointer', padding: '8px 14px', borderRadius: 8,
            fontSize: 12, fontWeight: 600,
            color: done ? 'var(--good-strong)' : 'var(--surface-1)',
            background: done ? 'var(--good-soft)' : 'var(--accent-strong)',
            border: done ? '1px solid var(--good-soft-bd)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}>
            {done ? <><Icon name="check" size={12}/> {lang === 'ko' ? '시작함' : 'Started'}</> : tr('startAction', lang)}
          </button>
          <button style={{
            all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: 11, color: 'var(--fg-muted)',
          }}>{tr('saveForLater', lang)}</button>
        </div>
      </div>
    );
  }

  function Evidence({ lang }) {
    const [open, setOpen] = useState(S.causes[0].id);
    return (
      <div style={{ padding: '28px 32px 48px' }}>
        <div style={{ maxWidth: 720 }}>
          <h1 className="serif" style={{ fontSize: 30, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
            {lang === 'ko' ? '왜 그랬을지, 같이 살펴봐요' : 'Let\'s walk through what we noticed'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.6 }}>
            {lang === 'ko'
              ? '매출이 줄었던 같은 기간에 함께 관측된 4가지 신호입니다. 원인이라고 단정할 수는 없지만, 이번 주 액션의 출발점이 됩니다.'
              : 'Four signals observed during the same period as the revenue dip. We can\'t prove they caused it, but they\'re the starting point for this week\'s actions.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22, maxWidth: 920 }}>
          {S.causes.map((c, i) => {
            const isOpen = open === c.id;
            return (
              <div key={c.id} style={{
                background: 'var(--surface-1)', border: '1px solid var(--rule)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                <button onClick={() => setOpen(isOpen ? null : c.id)} style={{
                  all: 'unset', cursor: 'pointer', width: '100%',
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 16,
                  padding: '16px 20px', alignItems: 'center',
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name={c.icon} size={18}/></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="serif" style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-strong)' }}>
                      {c.title[lang]}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                      {c.headline[lang]}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 16, fontWeight: 600,
                      color: c.delta < 0 ? 'var(--bad-strong)' : 'var(--accent-strong)' }}>
                      {fmtPct(c.delta)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                      {tr('strength_' + c.strength, lang)}
                    </div>
                  </div>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-2)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--fg-muted)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform .15s',
                  }}><Icon name="arrow-down" size={12}/></span>
                </button>
                {isOpen && (
                  <div style={{
                    padding: '4px 20px 20px 74px', borderTop: '1px dashed var(--rule)',
                    background: 'var(--surface-0)',
                  }}>
                    <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.65, margin: '12px 0' }}>{c.body[lang]}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center' }}>
                        {tr('howWeKnow', lang)}
                      </span>
                      {c.sources.map(src => <Pill key={src} tone="quiet" size="sm">{src}</Pill>)}
                      <Pill tone="warm" size="sm">{tr('observedTogether', lang)}</Pill>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function Actions({ lang }) {
    const [filter, setFilter] = useState('all');
    const items = S.actions.filter(a => filter === 'all' || a.timeframe === filter);
    const filters = [
      { id: 'all', label: lang === 'ko' ? '전체' : 'All', count: S.actions.length },
      { id: 'this-week', label: tr('thisWeekTag', lang), count: S.actions.filter(a => a.timeframe === 'this-week').length },
      { id: 'next-2-weeks', label: tr('next2', lang), count: S.actions.filter(a => a.timeframe === 'next-2-weeks').length },
      { id: 'next-month', label: tr('nextMonth', lang), count: S.actions.filter(a => a.timeframe === 'next-month').length },
    ];
    return (
      <div style={{ padding: '28px 32px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', maxWidth: 1040 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 30, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {lang === 'ko' ? '추천 액션 6가지' : 'Six things worth trying'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 8, maxWidth: 600, lineHeight: 1.6 }}>
              {lang === 'ko'
                ? '근거 후보에 연결해 추천한 액션이에요. 매출 회복을 보장하지는 않지만, 가장 시도해볼 만한 순서대로 정리했습니다.'
                : 'Recommendations tied to each cause candidate. Not a guarantee of revenue lift — ordered by what\'s worth trying first.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '20px 0 18px' }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              all: 'unset', cursor: 'pointer',
              padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
              color: filter === f.id ? 'var(--surface-1)' : 'var(--fg-muted)',
              background: filter === f.id ? 'var(--accent-strong)' : 'var(--surface-1)',
              border: filter === f.id ? '1px solid var(--accent-strong)' : '1px solid var(--rule)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.label} <span className="mono" style={{ opacity: 0.7, fontSize: 10 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, maxWidth: 1100 }}>
          {items.map(a => <ActionCard key={a.id} a={a} lang={lang}/>)}
        </div>
      </div>
    );
  }

  function ActionCard({ a, lang }) {
    const [done, setDone] = useState(false);
    const tfLabel = a.timeframe === 'this-week' ? tr('thisWeekTag', lang)
      : a.timeframe === 'next-2-weeks' ? tr('next2', lang) : tr('nextMonth', lang);
    return (
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--rule)',
        borderRadius: 14, padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone="warm" size="sm">{tfLabel}</Pill>
          <Pill tone="quiet" size="sm">{tr('effort_' + a.effort, lang)}</Pill>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, color: 'var(--accent-strong)' }}>
            {a.tied.map(t => <Icon key={t} name={t} size={12}/>)}
          </span>
        </div>
        <div className="serif" style={{ fontSize: 17, fontWeight: 500, color: 'var(--fg-strong)', lineHeight: 1.3 }}>
          {a.title[lang]}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{a.summary[lang]}</div>
        <ol style={{ margin: '4px 0 0', padding: '0 0 0 18px', fontSize: 12, color: 'var(--fg)', lineHeight: 1.65 }}>
          {a.steps.map((s, i) => <li key={i}>{s[lang]}</li>)}
        </ol>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => setDone(d => !d)} style={{
            all: 'unset', cursor: 'pointer', padding: '7px 14px', borderRadius: 8,
            fontSize: 12, fontWeight: 600,
            color: done ? 'var(--good-strong)' : 'var(--surface-1)',
            background: done ? 'var(--good-soft)' : 'var(--accent-strong)',
            border: done ? '1px solid var(--good-soft-bd)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {done ? <><Icon name="check" size={12}/> {lang === 'ko' ? '시작함' : 'Started'}</> : tr('startAction', lang)}
          </button>
          <button style={{
            all: 'unset', cursor: 'pointer', padding: '7px 10px', fontSize: 12, color: 'var(--fg-muted)',
          }}>{tr('saveForLater', lang)}</button>
        </div>
      </div>
    );
  }

  function Reliability({ lang }) {
    return (
      <div style={{ padding: '28px 32px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 720 }}>
          <span style={{
            width: 44, height: 44, borderRadius: 14, background: 'var(--good-soft)',
            color: 'var(--good-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--good-soft-bd)',
          }}><Icon name="shield" size={20}/></span>
          <div>
            <h1 className="serif" style={{ fontSize: 28, fontWeight: 500, margin: 0, color: 'var(--fg-strong)' }}>
              {lang === 'ko' ? '데이터, 믿어도 좋아요' : 'You can trust this data'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
              {lang === 'ko'
                ? '5개 데이터 소스 모두 예정된 주기로 갱신되었어요.'
                : 'All five sources are refreshing on schedule.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 24, maxWidth: 1040 }}>
          {S.reliability.sources.map(src => (
            <div key={src.id} style={{
              background: 'var(--surface-1)', border: '1px solid var(--rule)',
              borderRadius: 14, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: src.status === 'ok' ? 'var(--good)' : 'var(--accent)',
                }}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>{src.name[lang]}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11 }}>
                <span style={{ color: 'var(--fg-muted)' }}>{tr('cadence', lang)}</span>
                <span style={{ color: 'var(--fg)' }}>{src.cadence[lang]}</span>
                <span style={{ color: 'var(--fg-muted)' }}>{tr('freshAsOf', lang)}</span>
                <span className="mono" style={{ color: 'var(--fg)' }}>{src.freshness}</span>
                <span style={{ color: 'var(--fg-muted)' }}>{tr('coverage', lang)}</span>
                <span className="num" style={{ color: 'var(--fg)' }}>{src.coverage}%</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 24, padding: '18px 20px', borderRadius: 14,
          background: 'var(--surface-1)', border: '1px solid var(--rule)', maxWidth: 1040,
        }}>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'ko' ? '한계점' : 'What this is and isn\'t'}
          </div>
          <ul className="serif" style={{ margin: '8px 0 0', padding: '0 0 0 18px', fontSize: 14, lineHeight: 1.7, color: 'var(--fg)' }}>
            <li>{lang === 'ko' ? '분석 단위는 상권/업종이며, 개별 매장 매출이 아닙니다.' : 'Analysis is at trade-area / category level, not per individual store.'}</li>
            <li>{lang === 'ko' ? '매출과 인구는 모두 공공데이터 기반 추정치입니다.' : 'Revenue and population figures are public-data estimates.'}</li>
            <li>{lang === 'ko' ? '원인 후보는 상관관계에 기반하며, 인과관계가 확정된 것이 아닙니다.' : 'Cause candidates are correlations, not proven causes.'}</li>
          </ul>
        </div>
      </div>
    );
  }

  function DirectionC() {
    const [lang, setLang] = useState('ko');
    const [theme, setTheme] = useState('light');
    const [screen, setScreen] = useState('brief');
    const effective = theme === 'system' ? 'light' : theme;
    return (
      <>
        <style>{themeCSS}</style>
        <div className="dirC" data-theme={effective} data-screen-label={`C · ${screen}`} style={{ minHeight: '100%' }}>
          <ChromeBar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
            label={lang === 'ko' ? 'C · 액션 우선 매출 도우미' : 'C · Action-first Assistant'}/>
          <Header lang={lang} screen={screen} setScreen={setScreen}/>
          {screen === 'brief'       && <Brief lang={lang} setScreen={setScreen}/>}
          {screen === 'evidence'    && <Evidence lang={lang}/>}
          {screen === 'actions'     && <Actions lang={lang}/>}
          {screen === 'reliability' && <Reliability lang={lang}/>}
        </div>
      </>
    );
  }
  window.DirectionC = DirectionC;
})();
