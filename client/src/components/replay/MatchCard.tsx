import "./MatchCard.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card.tsx";
import Badge from "../ui/Badge.tsx";
import Avatar from "../ui/Avatar.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import UserLink from "../ui/UserLink.tsx";
import EloRangeBadge from "./EloRangeBadge.tsx";
import TierBadge from "./TierBadge.tsx";
import IconButton from "../ui/IconButton.tsx";
import useWatchLater from "../../hooks/useWatchLater.ts";
import { replayGameNames, replayGameIcons } from "../../util/consts.ts";
import type { MatchParticipantView, ReplaySummary } from "../../util/types.ts";

interface MatchCardProps {
  match: ReplaySummary;
  /** Optional viewer username; result chip is from this user's perspective. */
  viewerUsername?: string;
  /** Override the default navigation behavior. */
  onClick?: () => void;
}

function resolveResult(
  match: ReplaySummary,
  viewerUsername?: string,
): { label: string; variant: "win" | "loss" | "draw" | "default" } {
  if (match.result.outcome === "draw") return { label: "Draw", variant: "draw" };
  if (match.result.outcome === "abandoned") return { label: "Abandoned", variant: "default" };
  if (match.result.outcome === "forfeit") return { label: "Forfeit", variant: "default" };
  const winner = match.participants.find((p) => p.id === match.result.winnerId);
  if (!winner) return { label: "Win", variant: "win" };
  if (viewerUsername) {
    const me = match.participants.find((p) => p.username === viewerUsername);
    if (me) {
      return me.id === winner.id
        ? { label: "Win", variant: "win" }
        : { label: "Loss", variant: "loss" };
    }
  }
  return { label: "Win", variant: "win" };
}

function ParticipantRow({ p }: { p: MatchParticipantView }): JSX.Element {
  return (
    <div className="ga-match-card__player" data-testid="match-card-player">
      <Avatar name={p.displayName} size="sm" variant={p.type === "ai" ? "ai" : "default"} />
      <UserLink
        name={p.displayName}
        username={p.username}
        modelId={p.type === "ai" ? p.id : undefined}
        type={p.type}
        className="ga-match-card__player-name"
        testId="match-card-player-name"
      />
      <Badge
        variant={p.type === "ai" ? "ai" : "human"}
        testId={p.type === "ai" ? "match-card-badge-ai" : "match-card-badge-human"}
      >
        {p.type === "ai" ? "AI" : "Human"}
      </Badge>
    </div>
  );
}

/**
 * The replay card used everywhere - discovery feed, profile, featured strips.
 *
 * Layout is a CSS grid with fixed row areas so every card in a grid lines up
 * regardless of how long the participant names are. Long names are truncated
 * with ellipsis via `<UserLink>`'s `text-overflow` rule.
 */
export default function MatchCard({ match, viewerUsername, onClick }: MatchCardProps): JSX.Element {
  const navigate = useNavigate();
  const { has, toggle } = useWatchLater();

  function go() {
    if (onClick) onClick();
    else void navigate(`/replays/${match.matchId}`);
  }

  const [p1, p2] = match.participants;
  const result = resolveResult(match, viewerUsername);
  const inWatchLater = has(match.matchId);
  const avgElo = (() => {
    const ratings = match.participants
      .map((p) => p.ratingAtMatchTime)
      .filter((r): r is number => typeof r === "number");
    if (ratings.length === 0) return undefined;
    return Math.round(ratings.reduce((s, n) => s + n, 0) / ratings.length);
  })();

  return (
    <Card
      className="ga-match-card"
      onClick={go}
      testId="match-card"
      ariaLabel={`Replay: ${p1.displayName} vs ${p2.displayName}`}
    >
      <header className="ga-match-card__header">
        <div className="ga-match-card__game">
          <span className="ga-match-card__game-icon" aria-hidden="true">
            {replayGameIcons[match.gameKey]}
          </span>
          <Badge variant="default" testId="match-card-game">
            {replayGameNames[match.gameKey]}
          </Badge>
        </div>
        <IconButton
          aria-label={inWatchLater ? "Remove from watch later" : "Add to watch later"}
          icon={inWatchLater ? "★" : "☆"}
          size="sm"
          variant={inWatchLater ? "soft" : "ghost"}
          data-testid="watch-later-star"
          active={inWatchLater}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggle(match.matchId);
          }}
        />
      </header>

      <div className="ga-match-card__players" data-testid="match-card-title">
        <ParticipantRow p={p1} />
        <span className="ga-match-card__vs" aria-hidden="true">
          vs
        </span>
        <ParticipantRow p={p2} />
      </div>

      <div className="ga-match-card__stats">
        <span className="ga-match-card__stat" data-testid="match-card-moves">
          <span className="ga-match-card__stat-icon" aria-hidden="true">
            ⌗
          </span>
          {match.moveCount}
          <span className="ga-match-card__stat-label">moves</span>
        </span>
        <span className="ga-match-card__stat" data-testid="match-card-watches">
          <span className="ga-match-card__stat-icon" aria-hidden="true">
            ◎
          </span>
          {match.watchCount.toLocaleString()}
          <span className="ga-match-card__stat-label">views</span>
        </span>
        {match.rated ? (
          <Badge variant="info" testId="badge-rated">
            Rated
          </Badge>
        ) : null}
      </div>

      <footer className="ga-match-card__footer">
        <div className="ga-match-card__chips">
          <EloRangeBadge participants={match.participants} />
          {avgElo !== undefined && <TierBadge rating={avgElo} />}
          <Badge variant={result.variant} testId="match-card-result">
            {result.label}
          </Badge>
        </div>
        <span className="ga-match-card__date">
          <TimeAgo date={match.completedAt} testId="match-card-date" />
        </span>
      </footer>
    </Card>
  );
}
