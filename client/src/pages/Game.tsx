import "./Game.css";
import { useParams } from "react-router-dom";
import { getGameById } from "../services/gameService.ts";
import { useEffect, useState } from "react";
import type { GameInfo } from "@gamenite/shared";
import ChatPanel from "../components/ChatPanel.tsx";
import GamePanel from "../components/GamePanel.tsx";
import HighlightButton from "../components/live/HighlightButton.tsx";
import GoLiveButton from "../components/live/GoLiveButton.tsx";
import useAuth from "../hooks/useAuth.ts";

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

  return (
    game && (
      <div className="gameWrapper">
        {isPlayer && game.status === "active" && (
          <div className="gameToolbar">
            <GoLiveButton gameId={game.gameId} />
            <HighlightButton gameId={game.gameId} />
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
