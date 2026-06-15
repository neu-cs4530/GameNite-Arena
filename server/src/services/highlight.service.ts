import { type HighlightInfo } from "@gamenite/shared";
import { GameRepo, HighlightRepo } from "../repository.ts";
import { getBroadcast } from "./broadcast.service.ts";
import { type UserWithId } from "../types.ts";

/**
 * Expand a stored highlight into its info object (the record plus its id).
 *
 * @param highlightId - Valid highlight id
 * @returns the expanded highlight info object
 */
async function populateHighlightInfo(highlightId: string): Promise<HighlightInfo> {
  const highlight = await HighlightRepo.get(highlightId);
  return { highlightId, ...highlight };
}

/**
 * Bookmark the current moment of a match (Story 3.12). Allowed for a player in
 * the game, or — when `broadcastId` is given — the broadcaster of that
 * broadcast. The moment is stamped with `capturedAt`.
 *
 * @param user - The user pressing Highlight
 * @param gameId - The match being highlighted
 * @param opts - Optional originating broadcast and a short note
 * @param capturedAt - When Highlight was pressed
 * @returns the new highlight, or null if the game doesn't exist
 * @throws if the user is neither a player in the game nor its broadcaster
 */
export async function createHighlight(
  user: UserWithId,
  gameId: string,
  opts: { broadcastId?: string; note?: string },
  capturedAt: Date,
): Promise<HighlightInfo | null> {
  const game = await GameRepo.find(gameId);
  if (!game) return null;

  const isPlayer = game.players.includes(user.userId);
  let isBroadcaster = false;
  if (opts.broadcastId) {
    const broadcast = await getBroadcast(opts.broadcastId);
    isBroadcaster = broadcast?.broadcasterId === user.userId && broadcast.gameId === gameId;
  }
  if (!isPlayer && !isBroadcaster) {
    throw new Error("Only a player or the broadcaster can highlight this match");
  }

  const id = await HighlightRepo.add({
    gameId,
    userId: user.userId,
    broadcastId: opts.broadcastId,
    note: opts.note,
    capturedAt: capturedAt.toISOString(),
  });
  return populateHighlightInfo(id);
}

/**
 * List a user's bookmarked highlights, most recently captured first. Backs
 * their "bookmarked matches" section.
 *
 * @param userId - The owning user
 */
export async function listHighlightsForUser(userId: string): Promise<HighlightInfo[]> {
  const keys = await HighlightRepo.getAllKeys();
  const all = await Promise.all(keys.map(populateHighlightInfo));
  return all
    .filter((highlight) => highlight.userId === userId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}
