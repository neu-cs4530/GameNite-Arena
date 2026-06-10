import { type ReplayRecord } from "@gamenite/shared";
import { replayRepo } from "../services/replayStore.service.ts";
import { type RestAPI } from "../types.ts";

/**
 * Handle GET requests to `/api/replay/:gameId`. Reads the stored replay blob
 * straight from the repository (not by re-running the recorder) and returns it
 * as JSON, or 404 when no replay exists for that game.
 */
export const getById: RestAPI<ReplayRecord, { gameId: string }> = async (req, res) => {
  const replay = await replayRepo.getReplay(req.params.gameId);
  if (!replay) {
    res.status(404).send({ error: "No replay found for that game" });
    return;
  }

  res.send(replay);
};
