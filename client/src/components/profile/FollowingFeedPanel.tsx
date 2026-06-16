import "./FollowingFeedPanel.css";
import { useMemo, type JSX } from "react";
import { Link } from "react-router-dom";
import useFollowFeed from "../../hooks/useFollowFeed.ts";
import { activeStories, feedReplaysChronological } from "../../util/followFeed.ts";
import { replayGameNames } from "../../util/consts.ts";
import MatchCard from "../replay/MatchCard.tsx";
import Avatar from "../ui/Avatar.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import ErrorState from "../ui/ErrorState.tsx";
import Skeleton from "../ui/Skeleton.tsx";

export default function FollowingFeedPanel({
  viewerUsername,
}: {
  viewerUsername: string;
}): JSX.Element {
  const { data, loading, error, refetch } = useFollowFeed();

  const stories = useMemo(() => (data ? activeStories(data) : []), [data]);
  const replays = useMemo(() => (data ? feedReplaysChronological(data) : []), [data]);

  return (
    <div className="ga-feed" data-testid="following-feed">
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
            <MatchCard key={r.matchId} match={r} viewerUsername={viewerUsername} />
          ))}
        </div>
      )}
    </div>
  );
}
