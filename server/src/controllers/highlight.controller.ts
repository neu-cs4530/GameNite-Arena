/**
 * /api/highlight/... — the broadcaster's match bookmarks (Story 3.12). Pressing
 * "Highlight" during a live broadcast saves the current moment; the broadcaster
 * can list their saved highlights for their bookmarked matches section. Auth
 * rides in the request body, matching the rest of the REST API.
 */

import { withAuth, zUserAuth, type HighlightInfo } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import {
  HighlightTargetNotFound,
  createHighlight,
  listHighlightsForUser,
} from "../services/highlight.service.ts";
import { type RestAPI } from "../types.ts";

const zCreateHighlight = z
  .object({
    gameId: z.string().min(1).optional(),
    broadcastId: z.string().min(1).optional(),
    movesBack: z.number().int().positive().optional(),
    note: z.string().max(280).optional(),
  })
  // Identify the match by exactly one of broadcastId / gameId.
  .refine((d) => !!d.broadcastId !== !!d.gameId, {
    message: "Provide exactly one of broadcastId or gameId",
  });

const zAuthOnly = z.object({ auth: zUserAuth });

/**
 * Handle POST `/api/highlight/create` — save a clip of the last `movesBack`
 * moves of a match to the authed user's bookmarks. The match is identified by
 * `broadcastId` (clip a live broadcast) or `gameId` (highlight a game you play).
 */
export const postCreate: RestAPI<HighlightInfo> = async (req, res) => {
  const body = withAuth(zCreateHighlight).safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  try {
    res.send(await createHighlight(user, body.data.payload, new Date()));
  } catch (err) {
    if (err instanceof HighlightTargetNotFound) {
      res.status(404).send({ error: err.message });
      return;
    }
    res.status(403).send({ error: "Not allowed to highlight this match" });
  }
};

/**
 * Handle POST `/api/highlight/list` — the authed user's bookmarked highlights,
 * most recently captured first.
 */
export const postList: RestAPI<HighlightInfo[]> = async (req, res) => {
  const body = zAuthOnly.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  res.send(await listHighlightsForUser(user.userId));
};
