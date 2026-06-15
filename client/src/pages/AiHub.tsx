import "./Puzzles.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import GameSelectGrid, { type GameTileOption } from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";

const AI_HUB_TILES: GameTileOption[] = [
  { key: "trainer", label: "Trainer", tagline: "Train new models against real opponents" },
  { key: "models", label: "Models", tagline: "Browse and manage your trained models" },
];

const aiHubRoutes: Record<string, string> = {
  trainer: "/trainer",
  models: "/models",
};

export default function AiHub(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="ga-puzzles" data-testid="ai-hub-page">
      <PageHero title="AI" lede="Train new models, or browse and manage your model library." />

      <GameSelectGrid
        games={AI_HUB_TILES}
        onSelect={(key) => void navigate(aiHubRoutes[key])}
        testIdPrefix="ai-hub-tile"
      />
    </div>
  );
}
