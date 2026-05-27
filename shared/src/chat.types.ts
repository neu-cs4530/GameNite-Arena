import { type SafeUserInfo } from "./user.types.ts";
import { type MessageInfo } from "./message.types.ts";

/**
 * Represents a chat document in the database.
 * - `chatId`: database key
 * - `messages`: the ordered list of messages in the chat
 * - `createdAt`: when the chat was created
 */
export interface DatabaseChat {
  chatId: string;
  messages: string[];
  createdAt: Date;
}

/**
 * Represents a chat as exposed to the client
 * - `chatId`: database key
 * - `messages`: the ordered list of messages in the chat
 * - `createdAt`: when the chat was created
 */
export interface ChatInfo {
  chatId: string;
  messages: MessageInfo[];
  createdAt: Date;
}

/*** TYPES USED IN THE CHAT API ***/

/**
 * Relevant information for informing the client that a user joined a chat
 */
export interface ChatUserJoinedPayload {
  chatId: string;
  user: SafeUserInfo;
}

/**
 * Relevant information for informing the client that a user left a chat
 */
export interface ChatUserLeftPayload {
  chatId: string;
  user: SafeUserInfo;
}

/**
 * Relevant information for informing the client that a message was added to a
 * chat
 */
export interface ChatNewMessagePayload {
  chatId: string;
  message: MessageInfo;
}
