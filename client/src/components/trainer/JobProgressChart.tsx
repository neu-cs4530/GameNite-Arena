import "./JobProgressChart.css";
import type { JSX } from "react";

interface JobProgressChartProps {
  /** Episode markers; same length as `meanReward` and `winRate`. */
  episodes: number[];
  meanReward: number[];
  winRate: number[];
  /** When true, render the live legend dot and "Live" label. */
  isLive?: boolean;
  /** Compact sparkline mode (no axes / title / legend). */
  variant?: "full" | "mini";
  title?: string;
  testId?: string;
}

const MAX_POINTS = 200;

function tail<T>(arr: T[], n: number): T[] {
  return arr.length > n ? arr.slice(-n) : arr;
}

function buildPoints(
  values: number[],
  episodes: number[],
  width: number,
  height: number,
  yMin: number,
  yMax: number,
): string {
  if (values.length === 0 || episodes.length === 0) return "";
  const eMin = episodes[0];
  const eMax = episodes[episodes.length - 1];
  const xSpan = Math.max(1, eMax - eMin);
  const ySpan = Math.max(1e-6, yMax - yMin);
  return values
    .map((v, i) => {
      const x = ((episodes[i] - eMin) / xSpan) * width;
      const y = height - ((v - yMin) / ySpan) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Pure-SVG line chart. Two series (mean reward, win rate). Tokens drive colors.
 * No external chart library to keep bundle small and styling consistent.
 */
export default function JobProgressChart({
  episodes,
  meanReward,
  winRate,
  isLive,
  variant = "full",
  title = "Training progress",
  testId = "job-progress-chart",
}: JobProgressChartProps): JSX.Element {
  const e = tail(episodes, MAX_POINTS);
  const r = tail(meanReward, MAX_POINTS);
  const w = tail(winRate, MAX_POINTS);
  const points = Math.min(e.length, r.length, w.length);
  if (points < 2) {
    return (
      <div
        className={`ga-chart ${variant === "mini" ? "ga-chart--mini" : ""}`.trim()}
        data-testid={testId}
      >
        <div className="ga-chart__empty">No progress data yet.</div>
      </div>
    );
  }
  const trimmedE = e.slice(0, points);
  const trimmedR = r.slice(0, points);
  const trimmedW = w.slice(0, points);

  // Mean reward can be negative; cap range generously.
  const yMin = Math.min(0, ...trimmedR, ...trimmedW) - 0.05;
  const yMax = Math.max(1, ...trimmedR, ...trimmedW) + 0.05;

  const width = variant === "mini" ? 200 : 640;
  const height = variant === "mini" ? 48 : 240;
  const padLeft = variant === "mini" ? 0 : 36;
  const padBottom = variant === "mini" ? 0 : 24;
  const padTop = variant === "mini" ? 0 : 8;
  const padRight = variant === "mini" ? 0 : 8;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const rewardPoints = buildPoints(trimmedR, trimmedE, plotW, plotH, yMin, yMax);
  const winPoints = buildPoints(trimmedW, trimmedE, plotW, plotH, yMin, yMax);

  return (
    <div
      className={`ga-chart ${variant === "mini" ? "ga-chart--mini" : ""}`.trim()}
      data-testid={testId}
    >
      {variant === "full" && (
        <div className="ga-chart__title">
          <span className="ga-chart__title-text">{title}</span>
          <div className="ga-chart__legend">
            <span className="ga-chart__legend-item">
              <span
                className="ga-chart__legend-swatch ga-chart__swatch--reward"
                aria-hidden="true"
              />
              Mean reward
            </span>
            <span className="ga-chart__legend-item">
              <span
                className="ga-chart__legend-swatch ga-chart__swatch--winrate"
                aria-hidden="true"
              />
              Win rate
            </span>
            {isLive && (
              <span className="ga-chart__legend-item" data-testid="chart-live-indicator">
                ● Live
              </span>
            )}
          </div>
        </div>
      )}
      <svg
        className="ga-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
      >
        <g transform={`translate(${padLeft}, ${padTop})`}>
          {variant === "full" && (
            <g className="ga-chart__grid" aria-hidden="true">
              {[0.25, 0.5, 0.75].map((p) => (
                <line key={p} x1={0} x2={plotW} y1={plotH * p} y2={plotH * p} />
              ))}
            </g>
          )}
          <polyline
            points={rewardPoints}
            className={`ga-chart__series ga-chart__series--reward ${variant === "mini" ? "ga-chart__series--mini" : ""}`.trim()}
            stroke="var(--color-chart-1)"
            fill="none"
            strokeWidth={variant === "mini" ? 1.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-testid="chart-series-mean-reward"
          />
          <polyline
            points={winPoints}
            className={`ga-chart__series ga-chart__series--winrate ${variant === "mini" ? "ga-chart__series--mini" : ""}`.trim()}
            stroke="var(--color-chart-2)"
            fill="none"
            strokeWidth={variant === "mini" ? 1.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-testid="chart-series-win-rate"
          />
          {variant === "full" && (
            <g className="ga-chart__axis" aria-hidden="true">
              <line x1={0} y1={plotH} x2={plotW} y2={plotH} />
              <line x1={0} y1={0} x2={0} y2={plotH} />
              <text x={-6} y={plotH} textAnchor="end" dominantBaseline="hanging">
                {yMin.toFixed(2)}
              </text>
              <text x={-6} y={0} textAnchor="end" dominantBaseline="hanging">
                {yMax.toFixed(2)}
              </text>
              <text x={0} y={plotH + 14} textAnchor="start">
                {trimmedE[0].toLocaleString()}
              </text>
              <text x={plotW} y={plotH + 14} textAnchor="end">
                {trimmedE[trimmedE.length - 1].toLocaleString()}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
