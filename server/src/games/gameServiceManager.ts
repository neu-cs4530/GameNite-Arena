/* eslint @typescript-eslint/no-explicit-any: "off" */
/* eslint @typescript-eslint/no-unsafe-argument: "off" */
// We allow "any" because we use this in a context where we trust that games
// will only receive the same states they send. But we're on our own here:
// TypeScript isn't helping us make sure types don't get mismatched anymore.

import { type TaggedGameView } from "@gamenite/shared";
import { type GameViewUpdates } from "../types.ts";
import { type GameLogic } from "./gameLogic.ts";

export interface GameServicer {
  /**
   * The game cannot start until at least this many players join
   */
  minPlayers: number;

  /**
   * The game allows at most this many players (null to allow any number)
   */
  maxPlayers: number | null;

  /**
   * Initializes a new game with a given list of players
   * @param players - All game players' user IDs (needed to prepare updates)
   * @returns the game ID and initial views for all players
   */
  create: (players: string[]) => { state: unknown; views: GameViewUpdates };

  /**
   * Generate a view of the game
   * @param state - The game state (must be the structure the underlying game expects — TypeScript won't check this!)
   * @param playerIndex - The index of the player we're generating a view for (-1 for watchers)
   * @returns a game view object for that player
   */
  view: (state: any, playerIndex: number) => TaggedGameView;

  /**
   * Submit a move that changes the game's state
   * @param state - The game state (must be the structure the underlying game expects — TypeScript won't check this!)
   * @param movePayload - The unsanitized move input from the user
   * @param playerIndex - The index of the player in the game
   * @param players - All game players' user IDs (needed to prepare updates)
   * @returns updated views for all players, or null if the move was invalid
   */
  update: (
    state: any,
    movePayload: unknown,
    playerIndex: number,
    players: string[],
  ) => null | { state: unknown; views: GameViewUpdates; done: boolean };
}

export class GameService<State, View> implements GameServicer {
  private _logic: GameLogic<State, View>;

  constructor(logic: GameLogic<State, View>) {
    this._logic = logic;
  }

  get minPlayers() {
    return this._logic.minPlayers;
  }

  get maxPlayers() {
    return this._logic.maxPlayers;
  }

  private _view(state: State, playerIndex: number) {
    return this._logic.tagView(this._logic.viewAs(state, playerIndex));
  }

  private _makePlayerViews(players: string[], state: State) {
    return {
      watchers: this._view(state, -1),
      players: players.map((userId, index) => ({
        userId,
        view: this._view(state, index),
      })),
    };
  }

  create(players: string[]) {
    const state = this._logic.start(players.length);
    return { state: state, views: this._makePlayerViews(players, state) };
  }

  update(state: any, move: unknown, playerIndex: number, players: string[]) {
    const newState = this._logic.update(state, move, playerIndex);
    if (!newState) return null;
    return {
      state: newState,
      views: this._makePlayerViews(players, newState),
      done: this._logic.isDone(newState),
    };
  }

  view(state: any, playerIndex: number) {
    if (!state) throw new Error("Game state does not exist");
    return this._view(state, playerIndex);
  }
}
