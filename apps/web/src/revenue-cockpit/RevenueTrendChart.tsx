import { SCENARIO } from './revenueCockpitCopy';
import type { RcLang, Scenario } from './revenueCockpitTypes';

interface RevenueTrendChartProps {
  lang: RcLang;
  scenario?: Scenario;
  height?: number;
}

export function RevenueTrendChart({ lang, scenario = SCENARIO, height = 180 }: RevenueTrendChartProps) {
  const series = scenario.revSeries;
  const W = 720, H = height;
  const pad = { l: 44, r: 146, t: 20, b: 28 };
  const min = 84, max = 104;
  const xs = series.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / (series.length - 1));
  const ys = series.map(p => pad.t + (1 - (p.v - min) / (max - min)) * (H - pad.t - pad.b));
  const linePath = series.map((_, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const ticks = [85, 90, 95, 100];
  const annotations = [
    { id: 'demand',      yFrac: 0.18, label: lang === 'ko' ? `생활인구 ${scenario.populationChange.toFixed(1)}%` : `Foot traffic ${scenario.populationChange.toFixed(1)}%` },
    { id: 'weather',     yFrac: 0.45, label: lang === 'ko' ? `강수일수 +${scenario.rainyDayChange.toFixed(1)}%` : `Rainy days +${scenario.rainyDayChange.toFixed(1)}%` },
    { id: 'competition', yFrac: 0.72, label: lang === 'ko' ? `점포수 +${scenario.competitorChange.toFixed(1)}%` : `Stores +${scenario.competitorChange.toFixed(1)}%` },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map(t => {
        const y = pad.t + (1 - (t - min) / (max - min)) * (H - pad.t - pad.b);
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r + 8} y1={y} y2={y}
              stroke="var(--rc-rule)" strokeDasharray={t === 100 ? '0' : '2 4'}/>
            <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10"
              fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">{t}</text>
          </g>
        );
      })}

      {series.map((p, i) => (
        <text key={i} x={xs[i]} y={H - pad.b + 14} fontSize="10" textAnchor="middle"
          fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">{p.label}</text>
      ))}

      {/* drop band */}
      <rect x={xs[6]} y={pad.t} width={xs[7] - xs[6]} height={H - pad.t - pad.b}
        fill="var(--rc-bad-soft)" opacity="0.55"/>

      <path d={linePath} fill="none" stroke="var(--rc-accent)" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"/>

      {/* baseline marker */}
      <circle cx={xs[6]} cy={ys[6]} r="3.5" fill="var(--rc-surface-1)"
        stroke="var(--rc-accent)" strokeWidth="1.6"/>
      <text x={xs[6]} y={ys[6] - 11} textAnchor="middle" fontSize="10"
        fill="var(--rc-fg-muted)" fontFamily="var(--rc-mono)">
        {lang === 'ko' ? '기준' : 'Baseline'}
      </text>

      {/* compare marker */}
      <circle cx={xs[7]} cy={ys[7]} r="4.5" fill="var(--rc-bad-strong)"/>

      {/* drop indicator line */}
      <line
        x1={xs[6] + 4} x2={xs[7] - 4}
        y1={(ys[6] + ys[7]) / 2 - 14} y2={(ys[6] + ys[7]) / 2 - 14}
        stroke="var(--rc-bad-strong)" strokeWidth="1.2"/>
      <text
        x={(xs[6] + xs[7]) / 2} y={(ys[6] + ys[7]) / 2 - 18}
        textAnchor="middle" fontSize="11" fontWeight="700"
        fill="var(--rc-bad-strong)">
        {scenario.revenueChange.toFixed(1)}%
      </text>

      {/* cause annotation pins */}
      {annotations.map(a => {
        const ay = pad.t + a.yFrac * (H - pad.t - pad.b);
        return (
          <g key={a.id}>
            <line x1={xs[7] + 6} x2={W - pad.r + 8} y1={ys[7]} y2={ay}
              stroke="var(--rc-rule-strong)" strokeWidth="1"/>
            <circle cx={W - pad.r + 8} cy={ay} r="3" fill="var(--rc-accent-strong)"/>
            <text x={W - pad.r + 16} y={ay + 3.5} fontSize="10.5"
              fill="var(--rc-fg)" fontWeight="500">{a.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
