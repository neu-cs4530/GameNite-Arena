import "./RatingEmblem.css";
import type { JSX } from "react";
import Badge from "./Badge.tsx";
import TierBadge from "../replay/TierBadge.tsx";

interface RatingEmblemProps {
  rating: number;
  /** Glicko rating deviation — rd > 150 (or no games) reads as provisional. */
  rd?: number;
  gamesPlayed?: number;
  testId?: string;
}

/**
 * A player's standing in one game: tier emblem + Glicko rating, with an
 * honest "provisional" marker until the rating has settled. Every surface
 * that shows skill (ranked queue, leaderboards, recaps) uses this so a
 * rating always reads the same way.
 */
export default function RatingEmblem({
  rating,
  rd,
  gamesPlayed,
  testId = "rating-emblem",
}: RatingEmblemProps): JSX.Element {
  const provisional = (rd !== undefined && rd > 150) || gamesPlayed === 0;
  return (
    <span className="ga-rating-emblem" data-testid={testId}>
      <TierBadge rating={rating} withRating />
      {provisional && (
        <Badge variant="default" title="Rating still settling — play more rated games">
          provisional
        </Badge>
      )}
    </span>
  );
}
