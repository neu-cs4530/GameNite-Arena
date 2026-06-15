import {
  DEFAULT_HIGHLIGHT_MOVES_BACK,
  MAX_HIGHLIGHT_MOVES_BACK,
  type GameKey,
  type HighlightInfo,
} from "@gamenite/shared";
import { type MatchMove } from "../models.ts";
import { GameRepo, HighlightRepo, MatchRepo } from "../repository.ts";
import { getBroadcast } from "./broadcast.service.ts";
import { matchRecorder } from "./matchRecorder.service.ts";
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
 * The match's move history right now: the recorder's live in-memory buffer
 * while the game is in progress, falling back to the archived MatchRecord once
 * the game has finished (the recorder clears its buffer on game end).
 */
async function currentMoves(gameId: string): Promise<MatchMove[]> {
  if (matchRecorder.isRecording(gameId)) return matchRecorder.getRecordedMoves(gameId);
  return (await MatchRepo.find(gameId))?.moves ?? [];
}

/** Sentinel: the requested match doesn't exist (vs. a permission failure). */
export class HighlightTargetNotFound extends Error {}

/**
 * Bookmark a clip of a match (Story 3.12): capture the last `movesBack` moves
 * (or all if fewer) and save them to the user's highlights. The match is
 * identified by `broadcastId` (any viewer may clip a live broadcast) or by
 * `gameId` (a player may highlight a game they're in, live or not).
 *
 * @param user - The user saving the highlight
 * @param opts - The target (broadcastId or gameId), move window, optional note
 * @param capturedAt - When Highlight was pressed
 * @returns the new highlight
 * @throws HighlightTargetNotFound if the broadcast/game doesn't exist
 * @throws if highlighting by gameId and the user isn't a player in that game
 */
export async function createHighlight(
  user: UserWithId,
  opts: { broadcastId?: string; gameId?: string; movesBack?: number; note?: string },
  capturedAt: Date,
): Promise<HighlightInfo> {
  // Resolve the target game (and its key, for display) and check the user may
  // highlight it.
  let gameId: string;
  let gameKey: GameKey;
  let broadcastId: string | undefined;
  if (opts.broadcastId) {
    const broadcast = await getBroadcast(opts.broadcastId);
    if (!broadcast) throw new HighlightTargetNotFound("Broadcast not found");
    const game = await GameRepo.find(broadcast.gameId);
    if (!game) throw new HighlightTargetNotFound("Game not found");
    // Any viewer may clip a (public) broadcast to their own bookmarks.
    gameId = broadcast.gameId;
    gameKey = game.type;
    broadcastId = opts.broadcastId;
  } else if (opts.gameId) {
    const game = await GameRepo.find(opts.gameId);
    if (!game) throw new HighlightTargetNotFound("Game not found");
    if (!game.players.includes(user.userId)) {
      throw new Error("Only a player in the game can highlight it");
    }
    gameId = opts.gameId;
    gameKey = game.type;
  } else {
    throw new HighlightTargetNotFound("No broadcast or game specified");
  }

  const requested = opts.movesBack ?? DEFAULT_HIGHLIGHT_MOVES_BACK;
  const movesBack = Math.min(Math.max(1, Math.floor(requested)), MAX_HIGHLIGHT_MOVES_BACK);

  // Last `movesBack` moves, or all of them if the match is shorter. The clip's
  // first move sits at `startIndex` within the full match, so the replay can
  // open positioned at the start of the clip.
  const allMoves = await currentMoves(gameId);
  const moves = allMoves.slice(-movesBack);
  const startIndex = allMoves.length - moves.length;

  const id = await HighlightRepo.add({
    gameId,
    gameKey,
    userId: user.userId,
    broadcastId,
    note: opts.note,
    movesBack,
    moves,
    startIndex,
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
