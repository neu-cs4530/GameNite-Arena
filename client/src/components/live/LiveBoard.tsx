import type { JSX } from "react";
import type { SafeUserInfo, TaggedGameView } from "@gamenite/shared";
import NimReplayView from "../../games/replay/NimReplayView.tsx";
import GuessReplayView from "../../games/replay/GuessReplayView.tsx";
import CheckersReplayView from "../../games/replay/CheckersReplayView.tsx";
import Connect4ReplayView from "../../games/replay/Connect4ReplayView.tsx";
import TicTacToeReplayView from "../../games/replay/TicTacToeReplayView.tsx";
import StubReplayView from "../../games/replay/StubReplayView.tsx";
import { NIM_DEFAULT_START } from "../../games/replay/nimReducer.ts";
import type { MatchParticipantView } from "../../util/types.ts";

interface LiveBoardProps {
  view: TaggedGameView;
  players: SafeUserInfo[];
}

/**
 * Renders a live broadcast's current game view by reusing the same read-only
 * per-game components the replay viewer uses. The broadcast feed delivers a
 * full TaggedGameView (the watcher perspective), so no playback/derivation is
 * needed — just dispatch on `view.type`. Spectators never move, so there are
 * no interactive controls.
 */
export default function LiveBoard({ view, players }: LiveBoardProps): JSX.Element {
  const participants = toParticipants(players);
  switch (view.type) {
    case "nim":
      return (
        <NimReplayView
          view={view.view}
          participants={participants}
          startingPile={NIM_DEFAULT_START}
        />
      );
    case "guess":
      return <GuessReplayView view={view.view} participants={participants} />;
    case "tictactoe":
      return <TicTacToeReplayView view={view.view} participants={participants} />;
    case "connect4":
      return <Connect4ReplayView view={view.view} participants={participants} />;
    case "checkers":
      return <CheckersReplayView view={view.view} participants={participants} />;
    default:
      return <StubReplayView gameLabel="this game" />;
  }
}

/** Adapt the live game's players (SafeUserInfo) to the replay views' shape. */
function toParticipants(players: SafeUserInfo[]): MatchParticipantView[] {
  return players.map((p) => ({
    id: p.username,
    type: p.isAi ? "ai" : "human",
    displayName: p.display,
    username: p.isAi ? undefined : p.username,
  }));
}
