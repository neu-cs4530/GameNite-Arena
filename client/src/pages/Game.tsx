import "./Game.css";
import { useParams } from "react-router-dom";
import { getGameById } from "../services/gameService.ts";
import { useEffect, useState } from "react";
import type { GameInfo } from "@gamenite/shared";
import ChatPanel from "../components/ChatPanel.tsx";
import GamePanel from "../components/GamePanel.tsx";
import HighlightButton from "../components/live/HighlightButton.tsx";
import GoLiveButton from "../components/live/GoLiveButton.tsx";
import ForfeitButton from "../components/game/ForfeitButton.tsx";
import useAuth from "../hooks/useAuth.ts";
import { parseQueueSession, queueSessionKey, viewerOwnsAiSeat } from "../util/requeuePolicy.ts";

export default function Game() {
  const { gameId } = useParams();
  const { username } = useAuth();
  const [game, setGame] = useState<GameInfo | null>(null);

  useEffect(() => {
    let ignore = false;
    // non-nullish assertion is ok here given that Game is only called in a
    // route with `:gameId`
    getGameById(gameId!)
      .then((game) => {
        if (ignore) return;
        setGame(game);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      ignore = true;
    };
  }, [gameId]);

  const isPlayer = !!game && game.players.some((p) => p.username === username);

  // "My AI is playing for me": the viewer isn't a seat by username, but the
  // model they deployed (this tab's queue session) holds an AI seat in this
  // game. They watch the match, yet must still be able to forfeit it.
  const ownsAiSeat =
    !!game &&
    viewerOwnsAiSeat(
      parseQueueSession(window.sessionStorage.getItem(queueSessionKey(game.type))),
      game.players,
    );
  const canForfeit = isPlayer || ownsAiSeat;

  return (
    game && (
      <div className="gameWrapper">
        {canForfeit && game.status === "active" && (
          <div className="gameToolbar">
            {isPlayer && <GoLiveButton gameId={game.gameId} />}
            {isPlayer && <HighlightButton gameId={game.gameId} />}
            <ForfeitButton gameId={game.gameId} />
          </div>
        )}
        <div className="gameContainer">
          <GamePanel {...game} />
          <ChatPanel chatId={game.chat} />
        </div>
      </div>
    )
  );
}
