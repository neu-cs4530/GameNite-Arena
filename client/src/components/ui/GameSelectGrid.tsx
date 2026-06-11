import "./GameSelectGrid.css";
import type { JSX, ReactNode } from "react";

export interface GameTileOption {
  /** Stable key — the shared GameKey for playable games. */
  key: string;
  label: string;
  /** Optional one-liner under the title (player counts, mode, etc.). */
  tagline?: string;
}

interface GameSelectGridProps {
  games: GameTileOption[];
  onSelect: (key: string) => void;
  selectedKey?: string | null;
  /** Extra per-tile content (queue counts, your rating, streaks…). */
  renderTileExtra?: (key: string) => ReactNode;
  testIdPrefix?: string;
}

/**
 * The shared "pick a game" surface: one big tile per game, used by the
 * matchmaking portal, the leaderboards tab, and the puzzles tab so the
 * entry point to every per-game surface looks and behaves identically.
 * The grid is data-driven — adding a game to the platform list adds a tile
 * everywhere, no per-page work.
 */
export default function GameSelectGrid({
  games,
  onSelect,
  selectedKey,
  renderTileExtra,
  testIdPrefix = "game-tile",
}: GameSelectGridProps): JSX.Element {
  return (
    <div className="ga-game-grid" role="group" aria-label="Choose a game">
      {games.map((game) => {
        const selected = selectedKey === game.key;
        return (
          <button
            key={game.key}
            type="button"
            className={`ga-game-grid__tile${selected ? " ga-game-grid__tile--selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onSelect(game.key)}
            data-testid={`${testIdPrefix}-${game.key}`}
          >
            <span className="ga-game-grid__name">{game.label}</span>
            {game.tagline && <span className="ga-game-grid__tagline">{game.tagline}</span>}
            {renderTileExtra && (
              <span className="ga-game-grid__extra">{renderTileExtra(game.key)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
