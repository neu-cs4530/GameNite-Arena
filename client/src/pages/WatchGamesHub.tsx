import "./Puzzles.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import GameSelectGrid, { type GameTileOption } from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";

const WATCH_HUB_TILES: GameTileOption[] = [
  { key: "replays", label: "Replays", tagline: "Browse and watch finished matches" },
  { key: "live", label: "Live Games", tagline: "Watch games in progress right now" },
  { key: "highlights", label: "Highlights", tagline: "Notable moments worth a replay" },
];

const watchHubRoutes: Record<string, string> = {
  replays: "/replays",
  live: "/live",
  highlights: "/highlights",
};

export default function WatchGamesHub(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="ga-puzzles" data-testid="watch-hub-page">
      <PageHero
        title="Watch Games"
        lede="Catch up on replays, watch live games, or browse highlights."
      />

      <GameSelectGrid
        games={WATCH_HUB_TILES}
        onSelect={(key) => void navigate(watchHubRoutes[key])}
        testIdPrefix="watch-hub-tile"
      />
    </div>
  );
}
