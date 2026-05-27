import type {
  ClientToServerEvents,
  MessageInfo,
  SafeUserInfo,
  ServerToClientEvents,
} from "@gamenite/shared";
import type { Socket } from "socket.io-client";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * In addition to messages, chats can include socket-introduced messages
 * that a user entered or left the chat.
 */
export type ChatMessage =
  | MessageInfo
  | { messageId: string; meta: "entered"; dateTime: Date; user: SafeUserInfo }
  | { messageId: string; meta: "left"; dateTime: Date; user: SafeUserInfo };

export interface GameProps<View, Move> {
  userPlayerIndex: number;
  players: SafeUserInfo[];
  view: View;
  makeMove: (move: Move) => void;
}
