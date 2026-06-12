/**
 * REST endpoint for the aggregate profile summary.
 *
 * Routes (registered in app.ts under /api/profile):
 *   GET /api/profile/:username — full ProfileSummary (general + per-game +
 *   puzzle stats), unauthenticated like the other read surfaces.
 */
import { type Request, type Response } from "express";

export async function getProfileSummary(
  _req: Request<{ username: string }>,
  res: Response,
): Promise<void> {
  // Implemented by profile.service.ts (see docs/profile-puzzles-rework.md).
  res.status(501).send({ error: "profile summary not implemented yet" });
}
