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
 */
export interface GameLogic<GameState, GameView> {
  minPlayers: number;
  maxPlayers: number | null;
  start: (numPlayers: number) => GameState;
  update: (state: GameState, movePayload: unknown, playerIndex: number) => GameState | null;
  isDone: (state: GameState) => boolean;
  viewAs: (state: GameState, playerIndex: number) => GameView;
  tagView: (view: GameView) => TaggedGameView;
}
