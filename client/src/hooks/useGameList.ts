import type { ErrorMsg, GameInfo } from "@gamenite/shared";
import { useEffect, useState } from "react";
import { gameList } from "../services/gameService.ts";

/**
 * Custom hook to get the list of all thread summaries and decide on an
 * appropriate message if that list is not available.
 * @param maxSummaries - the maximum number of summaries desired (default is all of them)
 * @returns A message to display to the user (Loading... or an error message), or a list
 */
export default function useGameList(maxGames?: number): { message: string } | GameInfo[] {
  const [games, setGames] = useState<GameInfo[] | ErrorMsg | null>(null);

  useEffect(() => {
    gameList()
      .then(setGames)
      .catch((err) => {
        setGames({ error: `${err}` });
      });
  }, []);

  if (!games) return { message: "Loading..." };
  if ("error" in games) return { message: `Error: ${games.error}` };
  if (games.length === 0) return { message: "No games found..." };
  if (maxGames) return games.slice(0, maxGames);
  return games;
}
