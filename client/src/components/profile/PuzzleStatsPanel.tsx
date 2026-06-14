import "./PuzzleStatsPanel.css";
import type { JSX } from "react";
import type { ProfilePuzzleGameStats, ProfilePuzzleStats } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import StatTile from "../ui/StatTile.tsx";
import { gameNames } from "../../util/consts.ts";

interface PuzzleStatsPanelProps {
  stats: ProfilePuzzleStats;
}

/** "41s" under a minute, "1m 05s" above. */
function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function ratingValue(rating: number | null): string {
  return rating === null ? "Unrated" : String(Math.round(rating));
}

/**
 * The Puzzles scope of the profile page: overall + per-game puzzle elo,
 * solve rate, average time-to-solve, attempt counts, the effective streak,
 * and the recent-attempt history table — all straight from the
 * `ProfileSummary.puzzles` aggregate (real attempt-log data).
 */
export default function PuzzleStatsPanel({ stats }: PuzzleStatsPanelProps): JSX.Element {
  const hasHistory = stats.perGame.length > 0 || stats.recentAttempts.length > 0;
  if (!hasHistory) {
    return (
      <EmptyState
        icon="?"
        title="No puzzles attempted yet"
        body="Solve a daily puzzle to start a streak and earn a puzzle rating."
        testId="profile-puzzles-empty"
      />
    );
  }

  return (
    <div className="ga-puzzle-stats" data-testid="profile-puzzle-stats">
      <Card className="ga-puzzle-stats__overview">
        <StatTile
          label="Puzzle Elo"
          value={ratingValue(stats.overallRating)}
          sub="Mean of per-game ratings"
          testId="puzzle-stat-overall"
        />
        <StatTile
          label="Daily streak"
          value={stats.streak.current}
          sub={`Best ${stats.streak.best}`}
          testId="puzzle-streak"
        />
      </Card>

      {stats.perGame.map((g) => (
        <PuzzleGameRow key={g.gameKey} game={g} />
      ))}

      <Card className="ga-puzzle-stats__history">
        <h3 className="ga-puzzle-stats__history-title">Recent attempts</h3>
        {stats.recentAttempts.length === 0 ? (
          <EmptyState title="No attempts recorded yet" testId="puzzle-attempts-empty" />
        ) : (
          <table className="ga-puzzle-attempts" data-testid="puzzle-attempts">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Game</th>
                <th scope="col">Result</th>
                <th scope="col">Rated</th>
                <th scope="col">Elo</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentAttempts.map((a) => (
                <tr key={`${a.gameKey}-${a.createdAt}`} data-testid="puzzle-attempt-row">
                  <td>{a.date}</td>
                  <td>{gameNames[a.gameKey]}</td>
                  <td>
                    <Badge variant={a.success ? "win" : "loss"}>
                      {a.success ? "Solved" : "Missed"}
                    </Badge>
                  </td>
                  <td>{a.rated ? "Rated" : "Casual"}</td>
                  <td className="ga-puzzle-attempts__delta">{formatDelta(a.eloDelta)}</td>
                  <td>{formatTime(a.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function PuzzleGameRow({ game }: { game: ProfilePuzzleGameStats }): JSX.Element {
  const solveRate = `${Math.round(game.solveRate * 100)}%`;
  return (
    <Card className="ga-puzzle-stats__game" testId={`puzzle-stats-${game.gameKey}`}>
      <h3 className="ga-puzzle-stats__game-title">{gameNames[game.gameKey]}</h3>
      <div className="ga-puzzle-stats__game-tiles">
        <StatTile
          label="Elo"
          value={ratingValue(game.rating)}
          sub={game.provisional ? "Provisional" : undefined}
          testId={`puzzle-stat-${game.gameKey}-elo`}
        />
        <StatTile
          label="Solve rate"
          value={solveRate}
          testId={`puzzle-stat-${game.gameKey}-solve-rate`}
        />
        <StatTile
          label="Avg time"
          value={formatTime(game.avgTimeMs)}
          testId={`puzzle-stat-${game.gameKey}-avg-time`}
        />
        <StatTile
          label="Attempts"
          value={game.attempts}
          sub={`${game.solves} solved`}
          testId={`puzzle-stat-${game.gameKey}-attempts`}
        />
      </div>
    </Card>
  );
}
