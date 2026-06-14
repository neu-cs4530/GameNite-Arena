import useThreadList from "../hooks/useThreadList.ts";
import ThreadSummaryView from "../components/ThreadSummaryView.tsx";
import { useNavigate } from "react-router-dom";
import useGameList from "../hooks/useGameList.ts";
import GameSummaryView from "../components/GameSummaryView.tsx";
import { HomePuzzleCard } from "../components/puzzles/index.ts";

export default function Home() {
  const threadList = useThreadList(4);
  const gameList = useGameList(4);
  const navigate = useNavigate();

  return (
    <div className="content">
      {/* Renders nothing while loading / on outage — Home never breaks on puzzles. */}
      <HomePuzzleCard />
      <div className="spacedSection">
        <h2>Recent games</h2>
        {"message" in gameList ? (
          <div>{gameList.message}</div>
        ) : (
          <div id="gameList" className="dottedList">
            {gameList.map((game) => (
              <GameSummaryView {...game} key={game.gameId.toString()} />
            ))}
          </div>
        )}
        <div>
          {/* Games start through matchmaking now — the portal is the only door. */}
          <button className="primary narrow" onClick={() => navigate("/games")}>
            Find a Match
          </button>
        </div>
      </div>
      <div className="spacedSection">
        <h2>Recent forum posts</h2>
        {"message" in threadList ? (
          <div>{threadList.message}</div>
        ) : (
          <div id="threadList" className="dottedList">
            {threadList.map((thread) => (
              <ThreadSummaryView {...thread} key={thread.threadId.toString()} />
            ))}
          </div>
        )}
        <div>
          <button className="primary narrow" onClick={() => navigate("/forum/post/new")}>
            Create New Post
          </button>
        </div>
      </div>
    </div>
  );
}
