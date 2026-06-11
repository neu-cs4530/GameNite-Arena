import type { TaggedGameView, NimMove, GuessMove } from "@gamenite/shared";
import { useMemo } from "react";
import type { ReplayDetail } from "../util/types.ts";
import { NIM_DEFAULT_START, applyNimMove, nimViewFromState } from "../games/replay/nimReducer.ts";
import {
  applyGuessMove,
  buildInitialGuessState,
  guessViewFromState,
  type ReplayGuessState,
} from "../games/replay/guessReducer.ts";

/**
 * Replays state of a per-game view at a given move index. Pure: rebuilds
 * from move 0 each time. Cheap enough since replays are small (<200 moves).
 */
export default function useDerivedGameView(
  replay: ReplayDetail | null,
  moveIndex: number,
): TaggedGameView | null {
  return useMemo(() => {
    if (!replay) return null;
    if (replay.gameKey === "nim") return derivedNimView(replay, moveIndex);
    if (replay.gameKey === "guess") return derivedGuessView(replay, moveIndex);
    // Other game keys aren't supported yet — return null so the stub view
    // can render an explanation.
    return null;
  }, [replay, moveIndex]);
}

function derivedNimView(replay: ReplayDetail, moveIndex: number): TaggedGameView {
  // Prefer the recorded initial state; older replays without one default to
  // the standard 21-pile and player 0 to move.
  const recorded = replay.initialState as { remaining?: number; nextPlayer?: number } | undefined;
  let state = {
    remaining: recorded?.remaining ?? NIM_DEFAULT_START,
    nextPlayer: recorded?.nextPlayer ?? 0,
  };
  for (let i = 0; i < moveIndex && i < replay.moves.length; i++) {
    const move = replay.moves[i].move as NimMove;
    state = applyNimMove(state, move);
  }
  return { type: "nim", view: nimViewFromState(state) };
}

function derivedGuessView(replay: ReplayDetail, moveIndex: number): TaggedGameView {
  const secret = (replay.initialState as { secret?: number } | undefined)?.secret ?? 50;
  let state: ReplayGuessState = buildInitialGuessState(replay.participants.length, secret);
  for (let i = 0; i < moveIndex && i < replay.moves.length; i++) {
    const move = replay.moves[i] as { move: GuessMove; actor: string };
    const playerIndex = replay.participants.findIndex((p) => p.id === move.actor);
    if (playerIndex >= 0) {
      state = applyGuessMove(state, move.move, playerIndex);
    }
  }
  const finished = moveIndex >= replay.participants.length;
  return { type: "guess", view: guessViewFromState(state, finished) };
}
