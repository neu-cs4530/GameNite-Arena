import { type TaggedGameView, zConnect4Move, zTicTacToeMove } from "@gamenite/shared";
import NimReplayView from "../../games/replay/NimReplayView.tsx";
import GuessReplayView from "../../games/replay/GuessReplayView.tsx";
import CheckersReplayView from "../../games/replay/CheckersReplayView.tsx";
import Connect4ReplayView from "../../games/replay/Connect4ReplayView.tsx";
import TicTacToeReplayView from "../../games/replay/TicTacToeReplayView.tsx";
import StubReplayView from "../../games/replay/StubReplayView.tsx";
import type { MatchParticipantView, ReplayDetail, ReplayGameKey } from "../../util/types.ts";
import { replayGameNames } from "../../util/consts.ts";
import type { JSX } from "react";
import { NIM_DEFAULT_START } from "../../games/replay/nimReducer.ts";

interface GameViewerProps {
  view: TaggedGameView | null;
  replay: ReplayDetail;
  readOnly?: boolean;
  /** The selected AI model's move from the currently-displayed position, if
   * analysis with a model has run — highlighted green on the board. */
  aiMove?: unknown;
}

/**
 * Dispatcher that picks the right read-only per-game replay component based
 * on the replay's `gameKey`. The `view` prop is the derived state at the
 * current move from `useDerivedGameView`.
 */
export default function GameViewer({ view, replay, aiMove }: GameViewerProps): JSX.Element {
  const participants = replay.participants;
  if (view?.type === "nim") {
    return (
      <NimReplayView
        view={view.view}
        participants={participants}
        startingPile={extractStartingPile(replay) ?? NIM_DEFAULT_START}
      />
    );
  }
  if (view?.type === "guess") {
    return <GuessReplayView view={view.view} participants={participants} />;
  }
  if (view?.type === "tictactoe") {
    const ai = zTicTacToeMove.safeParse(aiMove);
    return (
      <TicTacToeReplayView
        view={view.view}
        participants={participants}
        aiMove={ai.success ? ai.data : undefined}
      />
    );
  }
  if (view?.type === "connect4") {
    const ai = zConnect4Move.safeParse(aiMove);
    return (
      <Connect4ReplayView
        view={view.view}
        participants={participants}
        aiMove={ai.success ? ai.data : undefined}
      />
    );
  }
  if (view?.type === "checkers") {
    return <CheckersReplayView view={view.view} participants={participants} />;
  }
  // No derived view (older replay without per-move reduction): explain via stub.
  return renderStubFor(replay.gameKey, participants);
}

function extractStartingPile(replay: ReplayDetail): number | undefined {
  const initial = replay.initialState as { remaining?: number } | undefined;
  return initial?.remaining;
}

function renderStubFor(key: ReplayGameKey, _participants: MatchParticipantView[]): JSX.Element {
  return <StubReplayView gameLabel={replayGameNames[key]} />;
}
