import "./Puzzles.css";
import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import PageHero from "../components/ui/PageHero.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import { TrainingPackFeed } from "../components/puzzles/index.ts";
import { gameNames, PUZZLE_GAME_KEYS } from "../util/consts.ts";

/**
 * The practice tab: unlimited, unrated puzzles mined from the match archive.
 * Same pick-a-game shell as the daily puzzles tab, but each selected game
 * renders a TrainingPackFeed instead of a single daily card.
 */
export default function Practice(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawGame = searchParams.get("game");
  const selected = PUZZLE_GAME_KEYS.find((key) => key === rawGame) ?? null;

  return (
    <div className="ga-puzzles" data-testid="practice-page">
      <PageHero
        title="Practice puzzles"
        kicker="Unlimited and unrated"
        lede="More positions mined from real archived matches. Solve as many as you like — these don't count toward your Puzzle Glicko or streak."
      />

      <GameSelectGrid
        games={PUZZLE_GAME_KEYS.map((key) => ({ key, label: gameNames[key] }))}
        selectedKey={selected}
        onSelect={(key) => setSearchParams({ game: key })}
        testIdPrefix="practice-game-tile"
      />

      {selected && (
        <div className="ga-puzzles__card-slot">
          <TrainingPackFeed gameKey={selected} />
        </div>
      )}
    </div>
  );
}
