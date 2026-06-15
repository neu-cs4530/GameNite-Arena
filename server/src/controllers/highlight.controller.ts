/**
 * /api/highlight/... — the broadcaster's match bookmarks (Story 3.12). Pressing
 * "Highlight" during a live broadcast saves the current moment; the broadcaster
 * can list their saved highlights for their bookmarked matches section. Auth
 * rides in the request body, matching the rest of the REST API.
 */

import { withAuth, zUserAuth, type HighlightInfo } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import { createHighlight, listHighlightsForUser } from "../services/highlight.service.ts";
import { type RestAPI } from "../types.ts";

const zCreateHighlight = z.object({
  gameId: z.string().min(1),
  broadcastId: z.string().min(1).optional(),
  note: z.string().max(280).optional(),
});

const zAuthOnly = z.object({ auth: zUserAuth });

/**
 * Handle POST `/api/highlight/create` — bookmark the current moment of a live
 * broadcast. Only the broadcast's broadcaster may do this.
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
    const { gameId, broadcastId, note } = body.data.payload;
    const highlight = await createHighlight(user, gameId, { broadcastId, note }, new Date());
    if (!highlight) {
      res.status(404).send({ error: "Game not found" });
      return;
    }
    res.send(highlight);
  } catch {
    res.status(403).send({ error: "Only a player or the broadcaster can highlight this match" });
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
