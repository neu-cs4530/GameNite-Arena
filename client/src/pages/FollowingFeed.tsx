import "./FollowingFeed.css";
import { useMemo, type JSX } from "react";
import { Link } from "react-router-dom";
import useFollowFeed from "../hooks/useFollowFeed.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { activeStories, feedReplaysChronological } from "../util/followFeed.ts";
import { replayGameNames } from "../util/consts.ts";
import MatchCard from "../components/replay/MatchCard.tsx";
import Avatar from "../components/ui/Avatar.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";

/**
 * The follower feed (Story 3.9): a sticky "stories" row of followed accounts
 * currently in a game (click to watch live), above a chronological scroll of
 * recent replays featuring people you follow. Reuses the standard MatchCard.
 *
 * Snapshot-on-mount, not live: a game that ends mid-scroll stays put until you
 * navigate away and come back. The stories row stays frozen at the top while
 * the feed scrolls beneath it.
 */
export default function FollowingFeed(): JSX.Element {
  const { user } = useLoginContext();
  const { data, loading, error, refetch } = useFollowFeed();

  const stories = useMemo(() => (data ? activeStories(data) : []), [data]);
  const replays = useMemo(() => (data ? feedReplaysChronological(data) : []), [data]);

  return (
    <div className="ga-feed" data-testid="following-feed">
      <header className="ga-feed__hero">
        <h1>Following</h1>
        <p>Live games from people you follow, and their latest matches.</p>
      </header>

      {/* Sticky stories row — stays frozen at the top while the feed scrolls. */}
      <div className="ga-feed__stories" data-testid="feed-stories">
        <span className="ga-feed__stories-label">Playing now</span>
        <div className="ga-feed__stories-row">
          {stories.length === 0 ? (
            <span className="ga-feed__stories-empty">No one you follow is playing right now.</span>
          ) : (
            stories.map((s) => (
              <Link
                key={s.user.username}
                to={`/game/${s.game.gameId}`}
                className="ga-feed__story"
                data-testid="feed-story"
                title={`Watch ${s.user.display} play ${replayGameNames[s.game.type]}`}
              >
                <span className="ga-feed__story-ring">
                  <Avatar name={s.user.display} size="lg" />
                </span>
                <span className="ga-feed__story-name">{s.user.display}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not load your feed" body={error.message} retry={() => refetch()} />
      ) : loading && !data ? (
        <div className="ga-feed__list" data-testid="feed-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={150} />
          ))}
        </div>
      ) : replays.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Your feed is empty"
          body="Follow some players and their recent games will show up here."
          action={
            <Link to="/replays" className="ga-feed__browse">
              Browse replays
            </Link>
          }
        />
      ) : (
        <div className="ga-feed__list" data-testid="feed-list">
          {replays.map((r) => (
            <MatchCard key={r.matchId} match={r} viewerUsername={user.username} />
          ))}
        </div>
      )}
    </div>
  );
}
