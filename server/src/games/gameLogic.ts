import { type TaggedGameView } from "@gamenite/shared";

/**
 * The description of a game's internal logic
 *
 *  - `minPlayers`: the game cannot start until at least this many players are
 *    present
 *  - `maxPlayers`: the game allows at most this many players (null to allow
 *    any number)
 *  - `start`: given the list of players, create a game state
 *  - `update`: updates the game state given a move by a player, or returns
 *    null if the move was not valid
 *  - `isDone`: checks if a state represents a completed game
 *  - `viewAs`: creates the view of a game's state for a given player (-1 for
 *    watchers)
 *  - `tagView`: adds the correct game key to the game view
 *  - `winnerIndex` (optional): given a finished state, returns the index of
 *    the winning player, or null for a draw. Only called when
 *    `isDone(state)` is true. Games without this hook archive a winnerless
 *    result.
 *  - `parseMove` (optional): canonicalizes a raw move payload (e.g. via the
 *    game's zod schema), returning the parsed value or null when the payload
 *    is invalid. Used so the match archive stores the schema-normalized move
 *    rather than the raw pre-validation payload.
 *  - `isWinningMove` (optional): true when playing `movePayload` from `state`
 *    keeps the mover on a winning line under perfect play. Powers the daily
 *    puzzle pipeline: mining only accepts positions where the archived move
 *    was genuinely winning, and grading accepts ANY winning move rather than
 *    just the archived one. Games without this hook are not puzzle-eligible.
 */
export interface GameLogic<GameState, GameView> {
  minPlayers: number;
  maxPlayers: number | null;
  start: (numPlayers: number) => GameState;
  update: (state: GameState, movePayload: unknown, playerIndex: number) => GameState | null;
  isDone: (state: GameState) => boolean;
  viewAs: (state: GameState, playerIndex: number) => GameView;
  tagView: (view: GameView) => TaggedGameView;
  winnerIndex?: (state: GameState) => number | null;
  // Returns the parsed move, or null when the payload is invalid. (Typed as
  // bare `unknown` because `unknown | null` is a redundant union.)
  parseMove?: (payload: unknown) => unknown;
  isWinningMove?: (state: GameState, movePayload: unknown) => boolean;
}
