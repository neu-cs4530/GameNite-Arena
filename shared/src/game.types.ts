import { z } from "zod";
import { type SafeUserInfo } from "./user.types.ts";

/**
 * Represents game information needed to load the game page
 * - `gameId`: database key
 * - `type`: picks which game this is
 * - `status`: whether the game is waiting, active, or done
 * - `chat`: id for the game's chat
 * - `players`: active players for the game
 * - `createdAt`: when the game was created
 * - `createdBy`: username of the person who created the game
 * - `minPlayers`: the minimum number of players required to start the game
 */
export interface GameInfo {
  gameId: string;
  type: GameKey;
  status: "waiting" | "active" | "done";
  chat: string;
  players: SafeUserInfo[];
  createdAt: Date;
  createdBy: SafeUserInfo;
  minPlayers: number;
}

/**
 * Represents game information needed to load a view of a game, which may or
 * may not be in progress.
 * - `gameId`: database key
 * - `view`: null if the game is still in a waiting-room state, or the game
 *   view object
 * - `players`: currently active players for the game
 */
export interface GamePlayInfo {
  gameId: string;
  view: TaggedGameView | null;
  players: SafeUserInfo[];
}

/*** TYPES USED IN THE GAMES API ***/

export type GameMakeMovePayload = z.infer<typeof zGameMakeMovePayload>;
export const zGameMakeMovePayload = z.object({
  gameId: z.string(),
  move: z.unknown(),
});

/*** INDIVIDUAL GAME TYPES ***/
import type { NimView } from "./games/nim.types.ts";
export * from "./games/nim.types.ts";

import type { GuessView } from "./games/guess.types.ts";
export * from "./games/guess.types.ts";

/**
 * A GameKey selects which game is being played. There needs to be exactly one
 * key for each game. See README.md for the operations that are required to
 * add a new game.
 */
export type GameKey = z.infer<typeof zGameKey>;
export const zGameKey = z.union([z.literal("nim"), z.literal("guess")]);

/**
 * The TaggedGameView type allows the views for different game to be
 * distinguished.
 *
 * Each game should have a tagged game view. The `type` should be the game's
 * GameKey, and the `view` should be the type of the games view.
 */
export type TaggedGameView = { type: "nim"; view: NimView } | { type: "guess"; view: GuessView };
