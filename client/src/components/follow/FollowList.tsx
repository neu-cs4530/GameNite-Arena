import "./FollowList.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import Avatar from "../ui/Avatar.tsx";
import Button from "../ui/Button.tsx";
import EmptyState from "../ui/EmptyState.tsx";

interface FollowListProps {
  users: SafeUserInfo[];
  /** The signed-in viewer — their own row gets no follow button. */
  viewerUsername: string;
  isFollowing: (username: string) => boolean;
  onFollow: (username: string) => void;
  onUnfollow: (username: string) => void;
  /** Username currently mid follow/unfollow request, for the loading state. */
  busy: string | null;
  emptyTitle: string;
  testId?: string;
}

/**
 * A list of accounts with per-row Follow / Following buttons (the Instagram
 * followers/following list). Reused for both the followers and following tabs
 * and driven by the viewer's follow graph so "follow back" works inline.
 */
export default function FollowList({
  users,
  viewerUsername,
  isFollowing,
  onFollow,
  onUnfollow,
  busy,
  emptyTitle,
  testId,
}: FollowListProps): JSX.Element {
  if (users.length === 0) {
    return <EmptyState icon="👤" title={emptyTitle} />;
  }
  return (
    <ul className="ga-follow-list" data-testid={testId}>
      {users.map((u) => {
        const self = u.username === viewerUsername;
        const followed = isFollowing(u.username);
        return (
          <li key={u.username} className="ga-follow-list__item" data-testid="follow-list-item">
            <Avatar name={u.display} size="sm" variant={u.isAi ? "ai" : "default"} />
            <Link to={`/profile/${u.username}`} className="ga-follow-list__name">
              {u.display}
            </Link>
            <span className="ga-follow-list__handle">@{u.username}</span>
            {!self && !u.isAi && (
              <Button
                className="ga-follow-list__btn"
                variant={followed ? "ghost" : "primary"}
                size="sm"
                loading={busy === u.username}
                onClick={() => (followed ? onUnfollow(u.username) : onFollow(u.username))}
              >
                {followed ? "Following" : "Follow"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
