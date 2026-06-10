import { GameService } from "./gameServiceManager.ts";
import { type NimState, type NimView, zNimMove } from "@gamenite/shared";
import { type GameLogic } from "./gameLogic.ts";

const START_NIM_OBJECTS = 21;

export const nimLogic: GameLogic<NimState, NimView> = {
  minPlayers: 2,
  maxPlayers: 2,
  start: () => ({ remaining: START_NIM_OBJECTS, nextPlayer: 0 }),
  update: ({ remaining, nextPlayer }, payload, playerIndex) => {
    const move = zNimMove.safeParse(payload);
    if (playerIndex !== nextPlayer) return null;
    if (move.error) return null;
    if (move.data > remaining) return null;
    return {
      remaining: remaining - move.data,
      nextPlayer: nextPlayer === 0 ? 1 : 0,
    };
  },
  isDone: ({ remaining }) => remaining === 0,
  viewAs: (state) => state,
  tagView: (view) => ({ type: "nim", view }),
  // Misère nim: whoever takes the LAST object LOSES. After the final move the
  // turn has already flipped, so `nextPlayer` is the player who did NOT take
  // the last object — i.e. the winner (matches the client NimGame end-of-game
  // copy). Only called when isDone(state) is true, so remaining is 0 here.
  winnerIndex: ({ nextPlayer }) => nextPlayer,
  parseMove: (payload) => {
    const move = zNimMove.safeParse(payload);
    return move.success ? move.data : null;
  },
};

export const nimGameService = new GameService<NimState, NimView>(nimLogic);
