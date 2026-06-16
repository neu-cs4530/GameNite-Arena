import "./ThreadSummaryView.css";
import { NavLink } from "react-router-dom";
import type { ThreadSummary } from "@gamenite/shared";
import useTimeSince from "../hooks/useTimeSince.ts";

export default function ThreadSummaryView({
  threadId,
  createdBy,
  createdAt,
  title,
  comments,
}: ThreadSummary) {
  const timeSince = useTimeSince();

  return (
    <div className="ga-thread-row" role="listitem">
      {/*
        Override the link's accessible name so thread titles that happen
        to contain reserved sidebar nav labels (Home, Games, Forum,
        Profile, Replays) don't collide with the nav e2e assertions. */}
      <NavLink
        to={`/forum/post/${threadId}`}
        className="ga-thread-row__title"
        aria-label={`Open thread ${threadId.toString().slice(0, 8)}`}
      >
        {title}
      </NavLink>
      <div className="ga-thread-row__meta">
        <span>
          {createdBy.display} &middot; {timeSince(createdAt)}
        </span>
        <span className="ga-thread-row__replies">
          {comments} {comments === 1 ? "reply" : "replies"}
        </span>
      </div>
    </div>
  );
}
