import { useEffect, useState } from "react";
import useLoginContext from "./useLoginContext.ts";
import type { ChatInfo, ChatNewMessagePayload, ChatUserJoinedPayload } from "@gamenite/shared";
import type { ChatMessage } from "../util/types.ts";
import useAuth from "./useAuth.ts";

/**
 * Custom hook to manage the socket connection for a chat.
 * @throws if outside a LoginContext
 * @returns an object containing
 * - `messages`: The current list of messages in the chat.
 * - `handleMessageCreation`: Sends a new message to the chat
 */

export default function useSocketsForChat(chatId: string) {
  const auth = useAuth();
  const { user, socket } = useLoginContext();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    const handleChatJoined = (chat: ChatInfo) => {
      if (chat.chatId !== chatId) return;
      socket.off("chatJoined", handleChatJoined);

      setMessages([
        ...chat.messages,
        { messageId: `meta${Math.random()}`, meta: "entered", user, dateTime: new Date() },
      ]);
      socket.on("chatNewMessage", handleNewMessage);
      socket.on("chatUserJoined", handleUserJoined);
    };

    const handleNewMessage = (payload: ChatNewMessagePayload) => {
      if (payload.chatId === chatId) {
        setMessages((oldMessages) => {
          if (!oldMessages) return null;
          return [...oldMessages, payload.message];
        });
      }
    };

    const handleUserJoined = (payload: ChatUserJoinedPayload) => {
      if (payload.chatId === chatId)
        setMessages((oldMessages) => {
          if (!oldMessages) return null;
          return [
            ...oldMessages,
            {
              messageId: `meta${Math.random()}`,
              meta: "entered",
              user: payload.user,
              dateTime: new Date(),
            },
          ];
        });
    };

    socket.emit("chatJoin", { auth, payload: chatId });
    socket.on("chatJoined", handleChatJoined);
    return () => {
      socket.off("chatNewMessage", handleNewMessage);
      socket.off("chatUserJoined", handleUserJoined);
      socket.off("chatJoined", handleChatJoined);
      socket.emit("chatLeave", { auth, payload: chatId });
    };
  }, [socket, auth, chatId, user]);

  function handleMessageCreation(text: string) {
    socket.emit("chatSendMessage", { auth, payload: { chatId, text } });
  }

  return { messages, handleMessageCreation };
}
