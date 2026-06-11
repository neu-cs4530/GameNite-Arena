import {
  type ChatInfo,
  type ChatNewMessagePayload,
  type ChatUserJoinedPayload,
  type ChatUserLeftPayload,
} from "./chat.types.ts";
import { type NewMessagePayload } from "./message.types.ts";
import { type WithAuth } from "./auth.types.ts";
import {
  type GameKey,
  type GameMakeMovePayload,
  type GamePlayInfo,
  type MatchmakingJoinPayload,
  type TaggedGameView,
} from "./game.types.ts";
import { type SafeUserInfo } from "./user.types.ts";
import { type MatchResultView, type ReplayWatchersPayload } from "./replay.types.ts";

/**
 * The Socket.io interface for client to server communication
 */
export interface ClientToServerEvents {
  chatJoin: (payload: WithAuth<string>) => void;
  chatLeave: (payload: WithAuth<string>) => void;
  chatSendMessage: (payload: WithAuth<NewMessagePayload>) => void;
  gameJoinAsPlayer: (payload: WithAuth<string>) => void;
  gameMakeMove: (payload: WithAuth<GameMakeMovePayload>) => void;
  gameStart: (payload: WithAuth<string>) => void;
  gameWatch: (payload: WithAuth<string>) => void;
  matchmakingJoin: (payload: WithAuth<MatchmakingJoinPayload>) => void;
  matchmakingLeave: (payload: WithAuth<GameKey>) => void;
  replayWatch: (payload: WithAuth<string>) => void;
  replayLeave: (payload: WithAuth<string>) => void;
}

/**
 * The Socket.io interface for server to client information
 */
export interface ServerToClientEvents {
  chatJoined: (payload: ChatInfo) => void;
  chatNewMessage: (payload: ChatNewMessagePayload) => void;
  chatUserJoined: (payload: ChatUserJoinedPayload) => void;
  chatUserLeft: (payload: ChatUserLeftPayload) => void;
  gamePlayersUpdated: (payload: SafeUserInfo[]) => void;
  gameResult: (payload: { gameId: string } & MatchResultView) => void;
  gameStateUpdated: (payload: TaggedGameView & { forPlayer: boolean }) => void;
  gameWatched: (payload: GamePlayInfo) => void;
  matchFound: (payload: { gameId: string; gameKey: GameKey }) => void;
  matchmakingTimeout: (payload: { gameKey: GameKey }) => void;
  matchmakingWindowUpdate: (payload: { gameKey: GameKey; window: number }) => void;
  replayWatchers: (payload: ReplayWatchersPayload) => void;
}
