import "./ThreadList.css";
import { useNavigate } from "react-router-dom";
import ThreadSummaryView from "../components/ThreadSummaryView.tsx";
import useThreadList from "../hooks/useThreadList.ts";

export default function ThreadList() {
  const threadList = useThreadList();
  const navigate = useNavigate();

  return (
    <div className="ga-forum">
      <header className="ga-forum__hero">
        <div className="ga-forum__hero-text">
          <h1>Forums</h1>
          <p>Discuss strategy, share replays, and talk to other players.</p>
        </div>
        <button className="ga-forum__new-btn" onClick={() => navigate("/forum/post/new")}>
          New Post
        </button>
      </header>

      {"message" in threadList ? (
        <p className="ga-forum__empty">{threadList.message}</p>
      ) : (
        <div className="ga-forum__list">
          {threadList.map((thread) => (
            <ThreadSummaryView {...thread} key={thread.threadId.toString()} />
          ))}
        </div>
      )}
    </div>
  );
}
