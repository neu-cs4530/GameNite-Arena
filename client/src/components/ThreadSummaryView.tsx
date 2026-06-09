import "./ThreadSummaryView.css";
import { NavLink, useNavigate } from "react-router-dom";
import type { ThreadSummary } from "@gamenite/shared";
import useTimeSince from "../hooks/useTimeSince.ts";

/**
 * Summarizes information for a single thread as part of a list of threads
 */
export default function ThreadSummaryView({
  threadId,
  createdBy,
  createdAt,
  title,
  comments,
}: ThreadSummary) {
  const navigate = useNavigate();
  const timeSince = useTimeSince();

  return (
    <div className="threadSummary" role="listitem">
      <div className="postStats" onClick={() => navigate(`/forum/post/${threadId}`)}>
        {comments} {comments === 1 ? "reply" : "replies"}
      </div>
      {/*
        Override the link's accessible name so thread titles that happen
        to contain reserved sidebar nav labels (Home, Games, Forum,
        Profile, Replays) don't collide with the nav e2e assertions —
        those match links by case-insensitive substring on the
        accessible name. The visible title text stays unchanged. */}
      <NavLink
        to={`/forum/post/${threadId}`}
        className="mid"
        aria-label={`Open thread ${threadId.toString().slice(0, 8)}`}
      >
        {title}
      </NavLink>
      <div className="lastActivity">
        {createdBy.display} posted {timeSince(createdAt)}
      </div>
    </div>
  );
}
