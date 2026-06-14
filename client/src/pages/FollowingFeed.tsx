import "./FollowingFeed.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useFollowingFeed } from "../hooks/useFollowerData.ts";
import { replayGameNames } from "../util/consts.ts";
import EmptyState from "../components/ui/EmptyState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import LiveDot from "../components/live/LiveDot.tsx";

/**
 * SCAFFOLD page for the follower feed (Story 3.9). The backend isn't built
 * yet, so the data hook reports "unavailable" and we render an honest
 * waiting-for-backend placeholder rather than fabricated followers. The real
 * data branches below are already wired so that when the backend lands the
 * feed lights up with no further UI work.
 */
export default function FollowingFeed(): JSX.Element {
  const { data, loading } = useFollowingFeed();

  return (
    <div className="ga-following" data-testid="following-feed">
      <header className="ga-following__hero">
        <h1>Following</h1>
        <p>See when people you follow go live, and jump straight into their games.</p>
      </header>

      {loading ? (
        <Skeleton variant="rect" height={120} />
      ) : data?.available ? (
        data.data.live.length === 0 ? (
          <EmptyState
            icon="👀"
            title="No one you follow is live"
            body="When someone you follow starts a game, it'll appear here."
          />
        ) : (
          <ul className="ga-following__list">
            {data.data.live.map((item) => (
              <li key={item.broadcastId} className="ga-following__item">
                <LiveDot />
                <span className="ga-following__name">{item.user.display}</span>
                <span className="ga-following__game">{replayGameNames[item.gameKey]}</span>
                <Link className="ga-following__watch" to={`/live/${item.broadcastId}`}>
                  Watch
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <EmptyState
          icon="🚧"
          title="Following is coming soon"
          body="The follow system is still being built on the backend. This is where the live games and recent matches of players you follow will appear."
          testId="following-waiting"
        />
      )}
    </div>
  );
}
