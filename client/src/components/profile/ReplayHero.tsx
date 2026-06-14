import "./ReplayHero.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { ReplaySummary } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import { replayGameIcons, replayGameNames } from "../../util/consts.ts";

interface ReplayHeroProps {
  /** The scope's most-viewed replay, or null when none exists. */
  replay: ReplaySummary | null;
}

/**
 * The "most-watched replay" hero for the current profile scope. Links into
 * the replay viewer; renders an honest empty state for users (or games)
 * without a watched replay yet.
 */
export default function ReplayHero({ replay }: ReplayHeroProps): JSX.Element {
  if (replay === null) {
    return (
      <EmptyState
        icon="▶"
        title="No watched replays yet"
        body="When this user's matches get watched, the most popular one is featured here."
        testId="profile-hero-replay-empty"
      />
    );
  }

  const players = replay.participants.map((p) => p.displayName).join(" vs ");
  return (
    <Card className="ga-replay-hero" testId="profile-hero-replay">
      <span className="ga-replay-hero__eyebrow">Most-watched replay</span>
      <div className="ga-replay-hero__main">
        <span className="ga-replay-hero__icon" aria-hidden="true">
          {replayGameIcons[replay.gameKey]}
        </span>
        <div className="ga-replay-hero__text">
          <Link className="ga-replay-hero__link" to={`/replays/${replay.matchId}`}>
            {players}
          </Link>
          <div className="ga-replay-hero__meta">
            <Badge variant="default">{replayGameNames[replay.gameKey]}</Badge>
            <span className="ga-replay-hero__watches" data-testid="profile-hero-watch-count">
              {replay.watchCount} {replay.watchCount === 1 ? "watch" : "watches"}
            </span>
            <TimeAgo date={replay.completedAt} />
          </div>
        </div>
      </div>
    </Card>
  );
}
