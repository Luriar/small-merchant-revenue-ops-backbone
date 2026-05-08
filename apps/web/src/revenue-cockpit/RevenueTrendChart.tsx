import { SCENARIO } from './revenueCockpitCopy';
import type { RcLang, RevSeries, Scenario } from './revenueCockpitTypes';

type TrendWindow = '8Q' | '4Q' | 'YoY' | 'daily' | 'weekly' | 'monthly';

interface RevenueTrendChartProps {
  lang: RcLang;
  scenario?: Scenario;
  height?: number;
  window?: TrendWindow;
  // Optional uploaded-data series (in net sales 원). When provided the chart
  // renders in uploaded-CSV mode with date x-axis ticks and KRW y-axis.
  uploadedSeries?: Array<{ date: string; net_sales: number; order_count?: number }>;
}

function formatQuarterLabel(label: string): string {
  // Accept "23Q1" or "2023Q1" or "2023 Q1" → render "2023 Q1".
  const compact = label.replace(/\s+/g, '');
  const m = compact.match(/^(\d{2,4})Q([1-4])$/i);
  if (!m) return label;
  const yearNum = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${yearNum} Q${m[2]}`;
}

function formatKRW(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000) return `₩${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `₩${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₩${Math.round(value / 1000)}K`;
  return `₩${Math.round(value)}`;
}

function selectSeries(series: RevSeries[], window: TrendWindow): { points: RevSeries[]; baselineIdx: number; compareIdx: number } {
  if (window === 'YoY' && series.length >= 5) {
    // YoY: same quarter prior year vs latest. We use the quarter 4 indices back
    // as the baseline so the comparison is the same Q one year earlier.
    const compareIdx = series.length - 1;
    const baselineIdx = Math.max(0, compareIdx - 4);
    return { points: series, baselineIdx, compareIdx };
  }
  if (window === '4Q' && series.length >= 4) {
    const points = series.slice(-4);
    return { points, baselineIdx: points.length - 2, compareIdx: points.length - 1 };
  }
  // 8Q: show whatever we have, up to last 8.
  const points = series.slice(-8);
  return { points, baselineIdx: points.length - 2, compareIdx: points.length - 1 };
}

export function RevenueTrendChart({ lang, scenario = SCENARIO, height = 200, window = '8Q', uploadedSeries }: RevenueTrendChartProps) {
  const isUploadedMode = Array.isArray(uploadedSeries) && uploadedSeries.length >= 2;
  if (isUploadedMode) {
    return <UploadedRevenueChart lang={lang} height={height} window={window} series={uploadedSeries!}/>;
  }
  const renderedSeries = scenario.revSeries.map((p) => ({ ...p, label: formatQuarterLabel(p.label) }));
  const { points, baselineIdx, compareIdx } = selectSeries(renderedSeries, window);
  const W = 760;
  const H = height;
  // Generous right/bottom padding so labels never clip — annotation pins
  // sit in the right column, x-axis labels live in the bottom column.
  const pad = { l: 48, r: 168, t: 26, b: 36 };

  const values = points.map(p => p.v);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const buffer = Math.max(2, (dataMax - dataMin) * 0.12);
  const yMin = Math.floor(dataMin - buffer);
  const yMax = Math.ceil(dataMax + buffer);

  const xs = points.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1));
  const ys = points.map(p => pad.t + (1 - (p.v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b));
  const linePath = points.map((_, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const tickValues = niceTicks(yMin, yMax, 4);

  const compareDelta = points.length >= 2
    ? ((points[compareIdx].v - points[baselineIdx].v) / points[baselineIdx].v) * 100
    : scenario.revenueChange;
  const isUp = compareDelta >= 0;
  const lineColor = isUp ? 'var(--rc-good)' : 'var(--rc-accent)';
  const compareColor = isUp ? 'var(--rc-good-strong)' : 'var(--rc-bad-strong)';
  const bandColor = isUp ? 'var(--rc-good-soft)' : 'var(--rc-bad-soft)';

  const annotations = [
    { id: 'demand',      yFrac: 0.18, label: lang === 'ko' ? `생활인구 ${scenario.populationChange.toFixed(1)}%` : `Foot traffic ${scenario.populationChange.toFixed(1)}%` },
    { id: 'weather',     yFrac: 0.45, label: lang === 'ko' ? `강수일수 ${scenario.rainyDayChange >= 0 ? '+' : ''}${scenario.rainyDayChange.toFixed(1)}%` : `Rainy days ${scenario.rainyDayChange >= 0 ? '+' : ''}${scenario.rainyDayChange.toFixed(1)}%` },
    { id: 'competition', yFrac: 0.72, label: lang === 'ko' ? `점포수 ${scenario.competitorChange >= 0 ? '+' : ''}${scenario.competitorChange.toFixed(1)}%` : `Stores ${scenario.competitorChange >= 0 ? '+' : ''}${scenario.competitorChange.toFixed(1)}%` },
  ];

  // Position the delta label inline above the segment between baseline and
  // compare; clamp Y so the label never crosses the top padding.
  const deltaY = Math.max(pad.t + 12, (ys[baselineIdx] + ys[compareIdx]) / 2 - 14);
  const deltaX = (xs[baselineIdx] + xs[compareIdx]) / 2;

  return (
    // overflow: visible so any labels that touch the viewBox edge still render.
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* y-axis grid */}
      {tickValues.map(t => {
        const y = pad.t + (1 - (t - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r + 8} y1={y} y2={y}
              stroke="var(--rc-rule)" strokeDasharray={t === 100 ? '0' : '2 4'}/>
            <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10"
              fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">{t}</text>
          </g>
        );
      })}

      {/* x-axis labels — live in the bottom padding so they never clip */}
      {points.map((p, i) => (
        <text key={i} x={xs[i]} y={H - pad.b + 18} fontSize="10.5" textAnchor="middle"
          fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">{p.label}</text>
      ))}

      {/* compare highlight band — only if we have a baseline/compare pair */}
      {compareIdx > baselineIdx && (
        <rect x={xs[baselineIdx]} y={pad.t} width={xs[compareIdx] - xs[baselineIdx]} height={H - pad.t - pad.b}
          fill={bandColor} opacity="0.55"/>
      )}

      {/* line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"/>

      {/* baseline marker */}
      <circle cx={xs[baselineIdx]} cy={ys[baselineIdx]} r="3.5" fill="var(--rc-surface-1)"
        stroke="var(--rc-accent)" strokeWidth="1.6"/>
      <text x={xs[baselineIdx]} y={ys[baselineIdx] - 11} textAnchor="middle" fontSize="10"
        fill="var(--rc-fg-muted)" fontFamily="var(--rc-mono)">
        {lang === 'ko' ? '기준' : 'Baseline'}
      </text>

      {/* compare marker */}
      <circle cx={xs[compareIdx]} cy={ys[compareIdx]} r="4.5" fill={compareColor}/>

      {/* delta label between baseline & compare — clamped inside plot area */}
      {compareIdx > baselineIdx && (
        <>
          <line
            x1={xs[baselineIdx] + 4} x2={xs[compareIdx] - 4}
            y1={deltaY + 5} y2={deltaY + 5}
            stroke={compareColor} strokeWidth="1.2"/>
          <text
            x={deltaX} y={deltaY}
            textAnchor="middle" fontSize="11.5" fontWeight="700"
            fill={compareColor}>
            {(compareDelta >= 0 ? '+' : '') + compareDelta.toFixed(1)}%
          </text>
        </>
      )}

      {/* cause annotation pins — anchored in right padding so labels never clip */}
      {annotations.map(a => {
        const ay = pad.t + a.yFrac * (H - pad.t - pad.b);
        return (
          <g key={a.id}>
            <line x1={xs[compareIdx] + 6} x2={W - pad.r + 8} y1={ys[compareIdx]} y2={ay}
              stroke="var(--rc-rule-strong)" strokeWidth="1"/>
            <circle cx={W - pad.r + 8} cy={ay} r="3" fill="var(--rc-accent-strong)"/>
            <text x={W - pad.r + 16} y={ay + 3.5} fontSize="10.5"
              fill="var(--rc-fg)" fontWeight="500">{a.label}</text>
          </g>
        );
      })}

      {/* axis titles */}
      <text
        x={pad.l - 36}
        y={pad.t + (H - pad.t - pad.b) / 2}
        transform={`rotate(-90, ${pad.l - 36}, ${pad.t + (H - pad.t - pad.b) / 2})`}
        textAnchor="middle"
        fontSize="10"
        fill="var(--rc-fg-muted)"
      >
        {lang === 'ko' ? '추정매출 지수 (2024 Q3 = 100)' : 'Revenue index (2024 Q3 = 100)'}
      </text>
      <text
        x={pad.l + (W - pad.l - pad.r) / 2}
        y={H - 4}
        textAnchor="middle"
        fontSize="10"
        fill="var(--rc-fg-muted)"
      >
        {lang === 'ko' ? '기간' : 'Period'}
      </text>
    </svg>
  );
}

// ─── Uploaded-CSV revenue chart ────────────────────────────────────────────
// Renders KRW net sales over time with date ticks. Tooltip shows date,
// value, and percent change vs the running average.
function UploadedRevenueChart({
  lang,
  height,
  series,
  window,
}: {
  lang: RcLang;
  height: number;
  series: Array<{ date: string; net_sales: number; order_count?: number }>;
  window: TrendWindow;
}) {
  const grouped = aggregateForWindow(series, window);
  const W = 760;
  const H = height;
  const pad = { l: 64, r: 28, t: 26, b: 44 };
  const values = grouped.map((d) => d.net_sales);
  const dataMin = Math.min(...values, 0);
  const dataMax = Math.max(...values);
  const buffer = Math.max(dataMax * 0.08, 1);
  const yMin = 0;
  const yMax = Math.ceil(dataMax + buffer);
  const xs = grouped.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, grouped.length - 1));
  const ys = grouped.map((d) => pad.t + (1 - (d.net_sales - yMin) / (yMax - yMin)) * (H - pad.t - pad.b));
  const linePath = grouped.map((_, i) => `${i ? 'L' : 'M'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const tickValues = niceTicks(yMin, yMax, 4);
  const avg = grouped.length ? grouped.reduce((s, d) => s + d.net_sales, 0) / grouped.length : 0;
  const tickIndices = chooseXTickIndices(grouped.length);
  const lineColor = 'var(--rc-accent)';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {tickValues.map((t) => {
        const y = pad.t + (1 - (t - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r + 4} y1={y} y2={y}
              stroke="var(--rc-rule)" strokeDasharray="2 4"/>
            <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize="10"
              fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">
              {formatKRW(t)}
            </text>
          </g>
        );
      })}

      {tickIndices.map((i) => (
        <text key={i} x={xs[i]} y={H - pad.b + 18} fontSize="10" textAnchor="middle"
          fill="var(--rc-fg-dim)" fontFamily="var(--rc-mono)">
          {formatXTickLabel(grouped[i].date, window)}
        </text>
      ))}

      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"/>

      {grouped.map((d, i) => {
        const isLow = avg > 0 ? d.net_sales < avg * 0.7 : false;
        const r = i === grouped.length - 1 ? 3.5 : isLow ? 2.5 : 1.5;
        const fill = isLow ? 'var(--rc-bad-strong)' : lineColor;
        const deltaPct = avg > 0 ? ((d.net_sales - avg) / avg) * 100 : 0;
        const tooltip = lang === 'ko'
          ? `${d.date}\n순매출: ${formatKRW(d.net_sales)}\n평균 대비: ${(deltaPct >= 0 ? '+' : '')}${deltaPct.toFixed(1)}%${d.order_count !== undefined ? `\n거래건수: ${d.order_count}` : ''}`
          : `${d.date}\nNet sales: ${formatKRW(d.net_sales)}\nvs avg: ${(deltaPct >= 0 ? '+' : '')}${deltaPct.toFixed(1)}%${d.order_count !== undefined ? `\nOrders: ${d.order_count}` : ''}`;
        return (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r={r} fill={fill}>
              <title>{tooltip}</title>
            </circle>
          </g>
        );
      })}

      {/* axis titles */}
      <text
        x={pad.l - 50}
        y={pad.t + (H - pad.t - pad.b) / 2}
        transform={`rotate(-90, ${pad.l - 50}, ${pad.t + (H - pad.t - pad.b) / 2})`}
        textAnchor="middle"
        fontSize="10"
        fill="var(--rc-fg-muted)"
      >
        {lang === 'ko' ? '순매출 (원)' : 'Net sales (KRW)'}
      </text>
      <text
        x={pad.l + (W - pad.l - pad.r) / 2}
        y={H - 4}
        textAnchor="middle"
        fontSize="10"
        fill="var(--rc-fg-muted)"
      >
        {lang === 'ko' ? '기간' : 'Period'}
      </text>
    </svg>
  );
}

function chooseXTickIndices(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 8) return Array.from({ length: count }, (_, i) => i);
  const step = Math.max(1, Math.floor(count / 6));
  const indices = new Set<number>();
  for (let i = 0; i < count; i += step) indices.add(i);
  indices.add(count - 1);
  return Array.from(indices).sort((a, b) => a - b);
}

function formatXTickLabel(date: string, window: TrendWindow): string {
  if (window === 'monthly') return date.slice(0, 7);
  return date.slice(5);
}

function aggregateForWindow(
  series: Array<{ date: string; net_sales: number; order_count?: number }>,
  window: TrendWindow,
): Array<{ date: string; net_sales: number; order_count?: number }> {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (window !== 'weekly' && window !== 'monthly') return sorted;
  const buckets = new Map<string, { net_sales: number; order_count: number; latest: string }>();
  for (const point of sorted) {
    const key = window === 'monthly' ? point.date.slice(0, 7) : isoWeekKey(point.date);
    const bucket = buckets.get(key) ?? { net_sales: 0, order_count: 0, latest: point.date };
    bucket.net_sales += point.net_sales;
    bucket.order_count += point.order_count ?? 0;
    bucket.latest = point.date;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    date: window === 'monthly' ? key : value.latest,
    net_sales: value.net_sales,
    order_count: value.order_count || undefined,
  }));
}

function isoWeekKey(date: string): string {
  // Use the Monday of the ISO week as the key.
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function niceTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  if (range <= 0) return [min];
  const rawStep = range / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10].map(m => m * magnitude);
  const step = candidates.find(c => c >= rawStep) ?? candidates[candidates.length - 1];
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + 0.001; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}
