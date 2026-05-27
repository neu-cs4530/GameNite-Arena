import "./NewForumComment.css";
import type { ThreadInfo } from "@gamenite/shared";
import useNewCommentForm from "../hooks/useNewCommentForm.ts";

interface NewForumCommentProps {
  threadId: string;
  firstPost: boolean;
  setThread: (newThread: ThreadInfo) => void;
}

/**
 * Allows the user to post a new comment to a forum post
 */
export default function NewForumComment({ threadId, firstPost, setThread }: NewForumCommentProps) {
  const { comment, err, handleSubmit, handleInputChange } = useNewCommentForm(
    threadId,
    firstPost,
    setThread,
  );

  return (
    <form className="newForumComment" onSubmit={handleSubmit}>
      <textarea
        className="notTooWide"
        placeholder={firstPost ? "Be the first to comment" : "Share your thoughts"}
        value={comment}
        onChange={handleInputChange}
      />
      {err && <p className="error-message">{err}</p>}
      <div>
        <button className="primary narrow">Add Comment</button>
      </div>
    </form>
  );
}
