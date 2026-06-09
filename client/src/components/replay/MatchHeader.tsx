import "./MatchHeader.css";
import type { JSX, ReactNode } from "react";
import type { ReplayDetail } from "../../util/types.ts";
import Avatar from "../ui/Avatar.tsx";
import Badge from "../ui/Badge.tsx";
import LiveCounter from "../ui/LiveCounter.tsx";
import UserLink from "../ui/UserLink.tsx";
import { replayGameNames } from "../../util/consts.ts";

interface MatchHeaderProps {
  replay: ReplayDetail;
  watchCount: number;
  liveWatching?: number;
  actions?: ReactNode;
}

function resultBadgeProps(replay: ReplayDetail): {
  label: string;
  variant: "win" | "draw" | "default";
} {
  if (replay.result.outcome === "draw") return { label: "Draw", variant: "draw" };
  if (replay.result.outcome === "abandoned") return { label: "Abandoned", variant: "default" };
  if (replay.result.outcome === "forfeit") return { label: "Forfeit", variant: "default" };
  const winner = replay.participants.find((p) => p.id === replay.result.winnerId);
  return { label: `${winner?.displayName ?? "Player"} wins`, variant: "win" };
}

function humanRelative(then: Date): string {
  const now = Date.now();
  const diffMs = now - then.getTime();
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function MatchHeader({
  replay,
  watchCount,
  liveWatching,
  actions,
}: MatchHeaderProps): JSX.Element {
  const [p1, p2] = replay.participants;
  const result = resultBadgeProps(replay);
  const dt = new Date(replay.completedAt);
  const iso = dt.toISOString();

  return (
    <div className="ga-match-header" data-testid="match-header">
      <div className="ga-match-header__left">
        <div className="ga-match-header__title">
          <span className="ga-match-header__game">{replayGameNames[replay.gameKey]}</span>
          <h1 className="ga-match-header__matchup" data-testid="match-header-participants">
            <span className="ga-match-header__player">
              <Avatar
                name={p1.displayName}
                size="md"
                variant={p1.type === "ai" ? "ai" : "default"}
              />
              <UserLink
                name={p1.displayName}
                username={p1.username}
                modelId={p1.type === "ai" ? p1.id : undefined}
                type={p1.type}
                className="ga-match-header__player-name"
              />
              <Badge variant={p1.type === "ai" ? "ai" : "human"}>
                {p1.type === "ai" ? "AI" : "Human"}
              </Badge>
            </span>
            <span className="ga-match-header__vs"> vs </span>
            <span className="ga-match-header__player">
              <Avatar
                name={p2.displayName}
                size="md"
                variant={p2.type === "ai" ? "ai" : "default"}
              />
              <UserLink
                name={p2.displayName}
                username={p2.username}
                modelId={p2.type === "ai" ? p2.id : undefined}
                type={p2.type}
                className="ga-match-header__player-name"
              />
              <Badge variant={p2.type === "ai" ? "ai" : "human"}>
                {p2.type === "ai" ? "AI" : "Human"}
              </Badge>
            </span>
          </h1>
        </div>
        <div className="ga-match-header__meta">
          <span data-testid="match-header-result">
            <Badge variant={result.variant}>{result.label}</Badge>
          </span>
          <span className="ga-match-header__sep" aria-hidden="true">
            •
          </span>
          <time className="ga-time-ago" dateTime={iso} title={iso} data-testid="match-header-date">
            {humanRelative(dt)}
          </time>
          <span className="ga-match-header__sep" aria-hidden="true">
            •
          </span>
          <span className="ga-match-header__views">
            {/*
              The watch counter is testid'd and the e2e suite parses the
              raw integer back via `Number(innerText)`, so we emit the
              plain digits (no thousands separator) here. The visible
              "views" suffix stays outside so the number's textContent is
              unambiguous. */}
            <LiveCounter value={watchCount} testId="match-header-watch-count" format="plain" />{" "}
            views
          </span>
          {liveWatching !== undefined && (
            <span className="ga-match-header__live" data-testid="live-watching" aria-live="polite">
              <span className="ga-match-header__live-dot" aria-hidden="true" />
              <LiveCounter value={liveWatching} format="plain" /> watching
            </span>
          )}
        </div>
      </div>
      {actions && <div className="ga-match-header__actions">{actions}</div>}
    </div>
  );
}
