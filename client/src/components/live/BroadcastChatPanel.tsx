import "./BroadcastChatPanel.css";
import type { JSX } from "react";
import MessageList from "../MessageList.tsx";
import MessageCreation from "../MessageCreation.tsx";
import useSocketsForBroadcastChat from "../../hooks/useSocketsForBroadcastChat.ts";

interface BroadcastChatPanelProps {
  /** The broadcast's chat channel id (a normal chat id). */
  chatChannel: string;
  /** The broadcast id — needed for the moderated send path. */
  broadcastId: string;
}

/**
 * The live broadcast chat box. Reuses the same presentational pieces as the
 * in-game chat (`MessageList` + `MessageCreation`); only the socket wiring
 * differs (moderated send + slow-mode/rate-limit notice) via
 * `useSocketsForBroadcastChat`.
 */
export default function BroadcastChatPanel({
  chatChannel,
  broadcastId,
}: BroadcastChatPanelProps): JSX.Element {
  const { messages, handleMessageCreation, notice } = useSocketsForBroadcastChat(
    chatChannel,
    broadcastId,
  );

  return (
    <div className="ga-broadcast-chat" data-testid="broadcast-chat">
      {messages ? (
        <>
          <MessageList messages={messages} />
          {notice && (
            <div
              className="ga-broadcast-chat__notice"
              role="status"
              data-testid="broadcast-chat-notice"
            >
              {notice}
            </div>
          )}
          <MessageCreation handleMessageCreation={handleMessageCreation} />
        </>
      ) : (
        <div className="ga-broadcast-chat__loading">Connecting to chat…</div>
      )}
    </div>
  );
}
