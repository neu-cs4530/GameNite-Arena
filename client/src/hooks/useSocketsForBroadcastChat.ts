import { useEffect, useState } from "react";
import type {
  BroadcastChatRejectedPayload,
  ChatInfo,
  ChatNewMessagePayload,
  ChatUserJoinedPayload,
} from "@gamenite/shared";
import type { ChatMessage } from "../util/types.ts";
import useAuth from "./useAuth.ts";
import useLoginContext from "./useLoginContext.ts";

/**
 * Socket wiring for a broadcast's chat. Joining and receiving reuse the
 * existing chat events (`chatJoin` / `chatJoined` / `chatNewMessage`) against
 * the broadcast's `chatChannel` — exactly as the backend intends. Only the
 * SEND path differs: messages go through the moderated `broadcastChatSend`
 * (rate limit + slow mode), and a rejection comes back as
 * `broadcastChatRejected`, surfaced here as a short notice.
 *
 * Pairs with the presentational MessageList + MessageCreation, so the chat box
 * looks and behaves like the in-game one.
 */
export default function useSocketsForBroadcastChat(
  chatChannel: string | undefined,
  broadcastId: string | undefined,
) {
  const auth = useAuth();
  const { user, socket } = useLoginContext();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!chatChannel) return;

    const handleChatJoined = (chat: ChatInfo) => {
      if (chat.chatId !== chatChannel) return;
      socket.off("chatJoined", handleChatJoined);
      setMessages([
        ...chat.messages,
        { messageId: `meta${Math.random()}`, meta: "entered", user, dateTime: new Date() },
      ]);
      socket.on("chatNewMessage", handleNewMessage);
      socket.on("chatUserJoined", handleUserJoined);
    };

    const handleNewMessage = (payload: ChatNewMessagePayload) => {
      if (payload.chatId !== chatChannel) return;
      setMessages((old) => (old ? [...old, payload.message] : old));
    };

    const handleUserJoined = (payload: ChatUserJoinedPayload) => {
      if (payload.chatId !== chatChannel) return;
      setMessages((old) =>
        old
          ? [
              ...old,
              {
                messageId: `meta${Math.random()}`,
                meta: "entered",
                user: payload.user,
                dateTime: new Date(),
              },
            ]
          : old,
      );
    };

    const handleRejected = (payload: BroadcastChatRejectedPayload) => {
      if (payload.broadcastId !== broadcastId) return;
      const secs = Math.max(1, Math.ceil(payload.retryAfterMs / 1000));
      setNotice(
        payload.reason === "slow-mode"
          ? `Slow mode is on — wait ${secs}s between messages.`
          : `Slow down — try again in ${secs}s.`,
      );
    };

    socket.emit("chatJoin", { auth, payload: chatChannel });
    socket.on("chatJoined", handleChatJoined);
    socket.on("broadcastChatRejected", handleRejected);
    return () => {
      socket.off("chatNewMessage", handleNewMessage);
      socket.off("chatUserJoined", handleUserJoined);
      socket.off("chatJoined", handleChatJoined);
      socket.off("broadcastChatRejected", handleRejected);
      socket.emit("chatLeave", { auth, payload: chatChannel });
    };
  }, [socket, auth, chatChannel, broadcastId, user]);

  function handleMessageCreation(text: string) {
    if (!broadcastId || text.trim().length === 0) return;
    setNotice(null);
    socket.emit("broadcastChatSend", { auth, payload: { broadcastId, text } });
  }

  return { messages, handleMessageCreation, notice };
}
