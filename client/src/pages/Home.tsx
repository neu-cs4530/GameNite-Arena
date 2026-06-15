import "./Puzzles.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import GameSelectGrid, { type GameTileOption } from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";

const HOME_TILES: GameTileOption[] = [
  { key: "matchmaking", label: "Matchmaking", tagline: "Find a match" },
  { key: "puzzles", label: "Puzzles", tagline: "Daily puzzle and practice" },
  { key: "watch", label: "Watch Games", tagline: "Replays, live games and highlights" },
  { key: "leaderboards", label: "Leaderboards", tagline: "See where you rank" },
  { key: "forum", label: "Forums", tagline: "Discuss with the community" },
];

const homeRoutes: Record<string, string> = {
  matchmaking: "/games",
  puzzles: "/puzzles",
  watch: "/watch",
  leaderboards: "/leaderboards",
  forum: "/forum",
};

export default function Home(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="ga-puzzles" data-testid="home-page">
      <PageHero
        title="Home"
        lede="Jump into a match, solve a puzzle, watch a game, or see how you rank."
      />

      <GameSelectGrid
        games={HOME_TILES}
        onSelect={(key) => void navigate(homeRoutes[key])}
        testIdPrefix="home-tile"
      />
    </div>
  );
}
