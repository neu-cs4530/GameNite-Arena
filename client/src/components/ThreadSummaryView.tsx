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
      <NavLink to={`/forum/post/${threadId}`} className="mid">
        {title}
      </NavLink>
      <div className="lastActivity">
        {createdBy.display} posted {timeSince(createdAt)}
      </div>
    </div>
  );
}
