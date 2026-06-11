import "./SlotCapacityIndicator.css";
import type { JSX } from "react";
import type { TrainerGameKey } from "../../util/types.ts";
import { trainerGameIcons, trainerGameNames } from "./trainerConsts.ts";

interface SlotCapacityIndicatorProps {
  gameKey: TrainerGameKey;
  used: number;
  cap?: number;
  testId?: string;
}

/** "2 / 3 slots used in Connect 4" with a progress bar. (Story 2.7) */
export default function SlotCapacityIndicator({
  gameKey,
  used,
  cap = 3,
  testId,
}: SlotCapacityIndicatorProps): JSX.Element {
  const isFull = used >= cap;
  const fillPct = Math.min(100, (used / cap) * 100);
  return (
    <div
      className={`ga-slot-cap ${isFull ? "ga-slot-cap--full" : ""}`.trim()}
      data-testid={testId ?? "slot-capacity-indicator"}
      data-game={gameKey}
      role="group"
      aria-label={`${used} of ${cap} slots used in ${trainerGameNames[gameKey]}`}
    >
      <div className="ga-slot-cap__header">
        <span className="ga-slot-cap__label">
          <span aria-hidden="true">{trainerGameIcons[gameKey]}</span>
          {trainerGameNames[gameKey]}
        </span>
        <span className="ga-slot-cap__count" data-testid={`slot-capacity-game-${gameKey}`}>
          {used} / {cap} slots used
        </span>
      </div>
      <div className="ga-slot-cap__bar" aria-hidden="true">
        <div
          className="ga-slot-cap__fill"
          data-testid="slot-bar-fill"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
