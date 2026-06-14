import "./ScopeStatPanel.css";
import type { JSX } from "react";
import type { ProfileRecordStats } from "@gamenite/shared";
import Card from "../ui/Card.tsx";
import StatTile from "../ui/StatTile.tsx";

interface ScopeEloStats {
  /** Live rating — only game scopes have one; General passes undefined. */
  current?: number | null;
  peak: number | null;
  average: number | null;
}

interface ScopeStatPanelProps {
  record: ProfileRecordStats;
  elo: ScopeEloStats;
}

function eloValue(value: number | null): string {
  return value === null ? "Unrated" : String(Math.round(value));
}

/**
 * The W/L/D + elo tile row for one profile scope (General or a single game).
 * All numbers are real server aggregates from the ProfileSummary slice the
 * page hands in; nulls render as an honest "Unrated".
 */
export default function ScopeStatPanel({ record, elo }: ScopeStatPanelProps): JSX.Element {
  const winRate =
    record.totalMatches > 0 ? Math.round((record.wins / record.totalMatches) * 100) : 0;
  return (
    <Card className="ga-scope-stats" testId="profile-stats">
      <StatTile label="Matches" value={record.totalMatches} testId="profile-stat-total" />
      <StatTile label="Wins" value={record.wins} tone="success" testId="profile-stat-wins" />
      <StatTile label="Losses" value={record.losses} tone="danger" testId="profile-stat-losses" />
      <StatTile label="Draws" value={record.draws} testId="profile-stat-draws" />
      <StatTile label="Win rate" value={`${winRate}%`} testId="profile-stat-win-rate" />
      {elo.current !== undefined && (
        <StatTile
          label="Current Elo"
          value={eloValue(elo.current)}
          testId="profile-stat-current-elo"
        />
      )}
      <StatTile label="Peak Elo" value={eloValue(elo.peak)} testId="profile-stat-peak-elo" />
      <StatTile label="Avg Elo" value={eloValue(elo.average)} testId="profile-stat-avg-elo" />
    </Card>
  );
}
