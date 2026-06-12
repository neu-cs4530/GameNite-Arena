/**
 * REST endpoint for the aggregate profile summary.
 *
 * Routes (registered in app.ts under /api/profile):
 *   GET /api/profile/:username — full ProfileSummary (general + per-game +
 *   puzzle stats), unauthenticated like the other read surfaces.
 */
import { type ProfileSummary } from "@gamenite/shared";
import { buildProfileSummary } from "../services/profile.service.ts";
import { type RestAPI } from "../types.ts";

/**
 * Serves the aggregate ProfileSummary for one user.
 * @param req The request with the username as a route parameter.
 * @param res The response: the summary (200) or an error (404).
 */
export const getProfileSummary: RestAPI<ProfileSummary, { username: string }> = async (
  req,
  res,
) => {
  const summary = await buildProfileSummary(req.params.username);
  if (summary === null) {
    res.status(404).send({ error: "User not found" });
    return;
  }
  res.send(summary);
};
