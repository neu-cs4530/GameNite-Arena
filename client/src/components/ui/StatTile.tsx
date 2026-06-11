import "./StatTile.css";
import type { JSX, ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value (deltas, context). */
  sub?: ReactNode;
  tone?: "default" | "success" | "danger";
  testId?: string;
}

/**
 * One labeled number. The shared atom for queue stats, post-match recaps,
 * leaderboard self-rows, and puzzle streaks — same rhythm everywhere.
 */
export default function StatTile({
  label,
  value,
  sub,
  tone = "default",
  testId,
}: StatTileProps): JSX.Element {
  return (
    <div className={`ga-stat-tile ga-stat-tile--${tone}`} data-testid={testId}>
      <span className="ga-stat-tile__label">{label}</span>
      <span className="ga-stat-tile__value">{value}</span>
      {sub !== undefined && <span className="ga-stat-tile__sub">{sub}</span>}
    </div>
  );
}
