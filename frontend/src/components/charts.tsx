/**
 * Small, dependency-free charts for dashboards.
 *
 * Every chart draws into a fixed viewBox and scales with its container
 * (width 100%, height from the aspect ratio), so layout never has to know
 * a pixel width. Colours come from CSS custom properties passed in by the
 * caller — the chart knows nothing about what the series mean.
 *
 * Accessibility: each chart carries an aria-label summary, and every bar
 * and point has a <title> with its exact value, which is also what a mouse
 * hover shows.
 */

import { getLocale } from "../lib/i18n";

/** Round figure for axis labels: 0, 50k, 1.2M. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${+(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/** Whole-number money for headline figures. Detail rows keep 2dp. */
export function whole(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString(getLocale(), { maximumFractionDigits: 0 });
}

/** A step size that gives `ticks` gridlines covering `max`. */
function niceStep(max: number, ticks: number): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= raw) return m * mag;
  }
  return 10 * mag;
}

export type BarSeries = { label: string; colour: string; values: number[] };
export type LineSeries = {
  label: string;
  colour: string;
  values: number[];
  /** Plot against a right-hand percentage axis instead of the money axis. */
  percent?: boolean;
  format?: (v: number) => string;
};

/**
 * Grouped bars per category, with an optional line overlaid.
 * `highlight` marks the categories in the selected period; the rest dim.
 */
export function TrendChart({
  categories, bars, line, highlight, ariaLabel, width = 720, height = 250,
}: {
  categories: string[];
  bars: BarSeries[];
  line?: LineSeries;
  highlight?: number[];
  ariaLabel: string;
  width?: number;
  height?: number;
}) {
  const pct = !!line?.percent;
  const pl = 44, pr = pct ? 44 : 8, pt = 10, pb = 26;
  const pw = width - pl - pr, ph = height - pt - pb;
  const n = Math.max(categories.length, 1);

  const barMax = Math.max(0, ...bars.flatMap((s) => s.values));
  const lineMax = !line || pct ? 0 : Math.max(0, ...line.values);
  const lineMin = !line || pct ? 0 : Math.min(0, ...line.values);
  const lo = Math.min(0, lineMin, ...bars.flatMap((s) => s.values));
  const step = niceStep(Math.max(barMax, lineMax) - lo, 4);
  const yMin = lo < 0 ? -Math.ceil(-lo / step) * step : 0;
  const yMax = Math.max(step, Math.ceil(Math.max(barMax, lineMax) / step) * step);
  const Y = (v: number) => pt + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);

  const pMax = pct ? Math.max(10, Math.ceil(Math.max(...(line?.values ?? [0])) / 10) * 10) : 0;
  const pMin = pct ? Math.min(0, Math.floor(Math.min(...(line?.values ?? [0])) / 10) * 10) : 0;
  const PY = (v: number) => pt + ph - ((v - pMin) / (pMax - pMin || 1)) * ph;

  const gw = pw / n;
  const bw = Math.min(14, (gw * 0.62) / Math.max(bars.length, 1));
  const lit = (i: number) => !highlight || highlight.length === 0 || highlight.includes(i);
  const cx = (i: number) => pl + i * gw + gw / 2;
  const lineY = (v: number) => (pct ? PY(v) : Y(v));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={ariaLabel} className="tchart">
      {highlight && highlight.length > 0 && highlight.length < n && (
        <rect x={pl + Math.min(...highlight) * gw} y={pt} width={highlight.length * gw} height={ph} rx={6} className="tchart-win" />
      )}
      {ticks.map((v) => (
        <g key={`t${v}`}>
          <line x1={pl} x2={width - pr} y1={Y(v)} y2={Y(v)} className={v === 0 ? "tchart-zero" : "tchart-grid"} />
          <text x={pl - 8} y={Y(v) + 4} textAnchor="end" className="tchart-ax">{compact(v)}</text>
        </g>
      ))}
      {pct && [pMin, (pMin + pMax) / 2, pMax].map((v) => (
        <text key={`p${v}`} x={width - pr + 8} y={PY(v) + 4} textAnchor="start" className="tchart-ax" style={{ fill: line?.colour }}>
          {Math.round(v)}%
        </text>
      ))}
      {categories.map((c, i) => (
        <g key={c + i} opacity={lit(i) ? 1 : 0.38}>
          {bars.map((s, k) => {
            const v = s.values[i] ?? 0;
            const x = cx(i) - (bars.length * bw + (bars.length - 1) * 2) / 2 + k * (bw + 2);
            const y0 = Y(0), y1 = Y(v);
            return (
              <rect key={s.label} x={x} width={bw} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y0 - y1))} rx={2} fill={s.colour}>
                <title>{`${c} · ${s.label}: ${whole(v)}`}</title>
              </rect>
            );
          })}
          <text x={cx(i)} y={height - 8} textAnchor="middle" className="tchart-ax">{c}</text>
        </g>
      ))}
      {line && (
        <>
          <polyline
            points={line.values.map((v, i) => `${cx(i)},${lineY(v)}`).join(" ")}
            fill="none" stroke={line.colour} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
          />
          {line.values.map((v, i) => (
            <circle key={i} cx={cx(i)} cy={lineY(v)} r={lit(i) ? 3.5 : 2.5} fill={line.colour} className="tchart-dot">
              <title>{`${categories[i]} · ${line.label}: ${line.format ? line.format(v) : whole(v)}`}</title>
            </circle>
          ))}
        </>
      )}
    </svg>
  );
}

/** Tiny trend line for a stat tile. */
export function Spark({ values, colour }: { values: number[]; colour: string }) {
  if (values.length < 2) return null;
  const W = 72, H = 26;
  const mn = Math.min(...values), mx = Math.max(...values);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One horizontal bar split into proportional segments (ageing, cost split). */
export function SplitBar({
  segments, height = 14, ariaLabel,
}: {
  segments: { label: string; value: number; colour: string }[];
  height?: number;
  ariaLabel: string;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  return (
    <div className="splitbar" style={{ height }} role="img" aria-label={ariaLabel}>
      {total > 0 && segments.map((s) =>
        s.value > 0 ? (
          <i key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.colour }} title={`${s.label}: ${whole(s.value)}`} />
        ) : null,
      )}
    </div>
  );
}
