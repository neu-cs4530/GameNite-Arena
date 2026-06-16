import "./ThreadPage.css";
import { useParams } from "react-router-dom";
import useThreadInfo from "../hooks/useThreadInfo.ts";
import NewForumComment from "../components/NewForumComment.tsx";
import useTimeSince from "../hooks/useTimeSince.ts";

export default function ThreadPage() {
  const formatTimeSince = useTimeSince();
  const { threadId } = useParams();

  // non-nullish assertion is okay here given that Thread is only called in a
  // route with `:threadId` on the path
  const { threadInfo, setThread } = useThreadInfo(threadId!);

  return (
    <div className="ga-thread-page">
      {"message" in threadInfo ? (
        <p className="ga-thread-page__error">{threadInfo.message}</p>
      ) : (
        <>
          <div className="ga-thread-page__post">
            <h1 className="ga-thread-page__title">{threadInfo.title}</h1>
            <p className="ga-thread-page__body">{threadInfo.text}</p>
            <div className="ga-thread-page__byline">
              Posted by {threadInfo.createdBy.display} &middot;{" "}
              {formatTimeSince(threadInfo.createdAt)}
            </div>
          </div>

          {threadInfo.comments.length > 0 && (
            <div className="ga-thread-page__comments">
              {threadInfo.comments.map(({ commentId, text, createdBy, createdAt, editedAt }) => (
                <div className="ga-thread-page__comment" role="listitem" key={commentId}>
                  <p className="ga-thread-page__comment-text">{text}</p>
                  <div className="ga-thread-page__comment-meta">
                    {createdBy.display}
                    {createdBy.username === threadInfo.createdBy.username && (
                      <span className="ga-thread-page__op-badge">OP</span>
                    )}{" "}
                    &middot; {formatTimeSince(createdAt)}
                    {editedAt && ` (edited ${formatTimeSince(editedAt)})`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <NewForumComment
            firstPost={threadInfo.comments.length === 0}
            threadId={threadInfo.threadId.toString()}
            setThread={setThread}
          />
        </>
      )}
    </div>
  );
}
