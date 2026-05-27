import { useEffect, useState } from "react";
import useAuth from "./useAuth.ts";
import type { GamePlayInfo, SafeUserInfo, TaggedGameView } from "@gamenite/shared";
import useLoginContext from "./useLoginContext.ts";

/**
 * Custom hook to manage socket connection for a game
 * @throws if outside a LoginContext
 * @returns an object containing:
 * - `hasWatched`: Boolean that goes from false to true once the server has
 *   acknowledged the socket connection request
 * - `players`: The current list of game players.
 * - `userPlayerIndex`: The index of the current user in the `players` array,
 *   or null if the user is not a player
 * - `view`: The current game view for this user
 * - `joinGame`: Joins the game (if not started)
 * - `startGame`: Start the game (once joined)
 */
export default function useSocketsForGame(gameId: string, initialPlayers: SafeUserInfo[]) {
  const { user, socket } = useLoginContext();
  const auth = useAuth();
  const [view, setView] = useState<null | TaggedGameView>(null);
  const [hasWatched, setHasWatched] = useState<boolean>(false);
  const [players, setPlayers] = useState<SafeUserInfo[]>(initialPlayers);
  const userPlayerIndex = players.findIndex(({ username }) => username === user.username);

  useEffect(() => {
    const handleWatched = (game: GamePlayInfo) => {
      if (game.gameId !== gameId) return;
      socket.off("gameWatched", handleWatched);
      setHasWatched(true);
      setPlayers(game.players);
      setView(game.view);
    };

    const handlePlayersUpdated = (newPlayers: SafeUserInfo[]) => {
      setPlayers(newPlayers);
    };

    const handleStateUpdated = (view: TaggedGameView & { forPlayer: boolean }) => {
      if (!view) return;
      if (userPlayerIndex >= 0 && !view.forPlayer) return;
      setView(view);
    };

    socket.on("gameWatched", handleWatched);
    socket.on("gamePlayersUpdated", handlePlayersUpdated);
    socket.on("gameStateUpdated", handleStateUpdated);
    socket.emit("gameWatch", { auth, payload: gameId });

    return () => {
      socket.off("gameWatched", handleWatched);
      socket.off("gamePlayersUpdated", handlePlayersUpdated);
      socket.off("gameStateUpdated", handleStateUpdated);
    };
  }, [gameId, socket, userPlayerIndex, auth]);

  function joinGame() {
    socket.emit("gameJoinAsPlayer", { auth, payload: gameId });
  }

  function startGame() {
    socket.emit("gameStart", { auth, payload: gameId });
  }

  return {
    hasWatched,
    players,
    userPlayerIndex,
    view,
    joinGame,
    startGame,
  };
}
