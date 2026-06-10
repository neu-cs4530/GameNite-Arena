import type { JSX } from "react";
import Badge from "../ui/Badge.tsx";
import type { TrainerGameKey } from "../../util/types.ts";
import { trainingModeByGame } from "./trainerConsts.ts";

interface ModeIndicatorProps {
  gameKey: TrainerGameKey;
  testId?: string;
}

/** "self-play" or "environment-driven" pill computed from a game key. */
export default function ModeIndicator({
  gameKey,
  testId = "mode-indicator",
}: ModeIndicatorProps): JSX.Element {
  const mode = trainingModeByGame[gameKey];
  return (
    <Badge variant={mode === "self-play" ? "info" : "warning"} testId={testId} title={mode}>
      {mode === "self-play" ? "Self-play" : "Environment-driven"}
    </Badge>
  );
}
