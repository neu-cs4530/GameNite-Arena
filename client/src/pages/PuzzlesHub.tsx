import "./Puzzles.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import GameSelectGrid, { type GameTileOption } from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";

const PUZZLES_HUB_TILES: GameTileOption[] = [
  { key: "daily", label: "Daily Puzzle", tagline: "One rated position per game, resets daily" },
  { key: "practice", label: "Practice", tagline: "Unlimited, unrated practice positions" },
];

const puzzlesHubRoutes: Record<string, string> = {
  daily: "/puzzles/daily",
  practice: "/puzzles/practice",
};

export default function PuzzlesHub(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="ga-puzzles" data-testid="puzzles-hub-page">
      <PageHero
        title="Puzzles"
        lede="Play today's rated puzzle, or practice with unlimited positions."
      />

      <GameSelectGrid
        games={PUZZLES_HUB_TILES}
        onSelect={(key) => void navigate(puzzlesHubRoutes[key])}
        testIdPrefix="puzzles-hub-tile"
      />
    </div>
  );
}
