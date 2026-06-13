import "./Leaderboards.css";
import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import LeaderboardBoard from "../components/leaderboard/LeaderboardBoard.tsx";
import { gameNames, PLAYABLE_GAME_KEYS } from "../util/consts.ts";

/**
 * /leaderboards — mirrors the games portal flow: hero + the shared game
 * grid; picking a game discloses that game's board on the same page. The
 * selected game lives in `?game=` so boards are linkable. The board itself
 * is the shared LeaderboardBoard component (the per-game section pages
 * embed the same one compact).
 */
export default function Leaderboards(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const gameParam = searchParams.get("game");
  const selectedGame = PLAYABLE_GAME_KEYS.find((key) => key === gameParam) ?? null;

  return (
    <div className="ga-leaderboards" data-testid="leaderboards-page">
      <PageHero
        title="Leaderboards"
        lede="The top Glicko ratings for every arena game. Pick a game to see its board."
      />

      <GameSelectGrid
        games={PLAYABLE_GAME_KEYS.map((key) => ({
          key,
          label: gameNames[key],
          tagline: "Glicko top 100",
        }))}
        selectedKey={selectedGame}
        onSelect={(key) => setSearchParams({ game: key })}
        testIdPrefix="lb-game-tile"
      />

      {selectedGame ? (
        <LeaderboardBoard key={selectedGame} gameKey={selectedGame} />
      ) : (
        <p className="ga-leaderboards__pick-hint" data-testid="lb-pick-hint">
          Select a game above to see its leaderboard.
        </p>
      )}
    </div>
  );
}
