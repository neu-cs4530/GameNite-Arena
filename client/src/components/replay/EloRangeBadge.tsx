import Badge from "../ui/Badge.tsx";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface EloRangeBadgeProps {
  participants: MatchParticipantView[];
  testId?: string;
}

/**
 * Renders an "Elo range" chip: either `min-max` if both participants have
 * rating snapshots, or `Avg N` for a single rating, or nothing if no
 * ratings exist. The output format is contract-bound to the regex
 * `\d{3,4}\s*-\s*\d{3,4}` from the profile tests.
 */
export default function EloRangeBadge({
  participants,
  testId = "match-card-elo-range",
}: EloRangeBadgeProps): JSX.Element | null {
  const ratings = participants
    .map((p) => p.ratingAtMatchTime)
    .filter((r): r is number => typeof r === "number");
  if (ratings.length === 0) return null;
  if (ratings.length === 1) {
    return (
      <Badge variant="default" testId={testId} title="Average Elo">
        Avg {ratings[0]}
      </Badge>
    );
  }
  const lo = Math.min(...ratings);
  const hi = Math.max(...ratings);
  const label = `${lo}-${hi}`;
  return (
    <Badge variant="default" testId={testId} title="Elo range of participants">
      {label}
    </Badge>
  );
}
