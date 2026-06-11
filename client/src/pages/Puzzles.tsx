import "./Puzzles.css";
import { useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { GameKey } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import { DailyPuzzleCard } from "../components/puzzles/index.ts";
import { gameNames, PUZZLE_GAME_KEYS } from "../util/consts.ts";

/**
 * The daily puzzles tab, progressive-disclosure style:
 *
 *   at rest    — hero + one tile per puzzle game, nothing else.
 *   on select  — that game's daily puzzle card loads below; the choice
 *                lives in `?game=` so puzzle links are shareable.
 *   on attempt — verdict, rating + streak tiles, and only then the
 *                engine's solution.
 *
 * Tiles render from PUZZLE_GAME_KEYS (deducible games only), not the full
 * playable list — deep-linking `?game=` to a non-puzzle game like guess
 * falls back to the pick-a-game state instead of an unsolvable board.
 *
 * "Solved today ✓" tile markers are session-only: there is no endpoint for
 * past attempts, so we only know about solves the user made on this visit.
 */
export default function Puzzles(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [solvedToday, setSolvedToday] = useState<Partial<Record<GameKey, boolean>>>({});

  const rawGame = searchParams.get("game");
  const selected = PUZZLE_GAME_KEYS.find((key) => key === rawGame) ?? null;

  // The daily cycle flips at UTC midnight — show the puzzle day, which can
  // differ from the local calendar day in the evening, and say why.
  const puzzleDay = dayjs(dayjs().toISOString().slice(0, 10)).format("dddd, MMMM D, YYYY");

  return (
    <div className="ga-puzzles" data-testid="puzzles-page">
      <PageHero
        title="Daily puzzles"
        kicker={`${puzzleDay} · resets at UTC midnight`}
        lede="One position per game, mined from real archived matches. Pick a game to play today's puzzle — solves build your streak and your Puzzle Glicko."
      />

      <GameSelectGrid
        games={PUZZLE_GAME_KEYS.map((key) => ({ key, label: gameNames[key] }))}
        selectedKey={selected}
        onSelect={(key) => setSearchParams({ game: key })}
        renderTileExtra={(key) =>
          solvedToday[key as GameKey] ? (
            <Badge variant="success" testId={`puzzle-solved-${key}`}>
              Solved today ✓
            </Badge>
          ) : (
            <span className="ga-puzzles__tile-note">Daily puzzle</span>
          )
        }
        testIdPrefix="puzzle-game-tile"
      />

      {selected && (
        <div className="ga-puzzles__card-slot">
          {/* key remounts the card on game switch: fresh fetch, fresh attempt machine */}
          <DailyPuzzleCard
            key={selected}
            gameKey={selected}
            onSolved={(gameKey) => setSolvedToday((prev) => ({ ...prev, [gameKey]: true }))}
          />
        </div>
      )}
    </div>
  );
}
