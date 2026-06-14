/**
 * Broadcast chat (Story 3.8): posting messages into a broadcast's chat channel
 * with per-channel rate limiting and slow mode. Joining the channel and
 * receiving messages reuse the existing chat socket events (chatJoin /
 * chatNewMessage) against the broadcast's `chatChannel`, so this file only adds
 * the moderated send path plus the broadcaster's slow-mode control.
 */

import { withAuth, type BroadcastInfo } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth, enforceAuth } from "../services/auth.service.ts";
import { getBroadcast } from "../services/broadcast.service.ts";
import { addMessageToChat } from "../services/chat.service.ts";
import { createMessage } from "../services/message.service.ts";
import { checkAndRecordSend, setSlowMode } from "../services/broadcastChat.service.ts";
import { logSocketError } from "./socket.controller.ts";
import { type RestAPI, type SocketAPI } from "../types.ts";

/** Slow mode is capped at 5 minutes between messages. */
const MAX_SLOW_MODE_SEC = 300;

const zBroadcastChatSend = z.object({
  broadcastId: z.string().min(1),
  text: z.string().min(1),
});

const zSetSlowMode = z.object({
  seconds: z.number().int().min(0).max(MAX_SLOW_MODE_SEC),
});

/**
 * Socket request to post a message to a broadcast's chat. Enforces the
 * channel's slow mode and the rate-limit window; on rejection notifies only the
 * author via `broadcastChatRejected`, otherwise broadcasts the message to the
 * channel room as a normal `chatNewMessage`.
 */
export const socketBroadcastChatSend: SocketAPI = (socket, io) => async (body) => {
  try {
    const { auth, payload } = withAuth(zBroadcastChatSend).parse(body);
    const user = await enforceAuth(auth);
    const broadcast = await getBroadcast(payload.broadcastId);
    if (!broadcast || broadcast.status !== "live") {
      throw new Error(`Cannot chat on broadcast ${payload.broadcastId}`);
    }

    const decision = checkAndRecordSend(broadcast.chatChannel, user.userId, Date.now());
    if (!decision.ok) {
      socket.emit("broadcastChatRejected", {
        broadcastId: broadcast.broadcastId,
        reason: decision.reason,
        retryAfterMs: decision.retryAfterMs,
      });
      return;
    }

    const message = await createMessage(user, payload.text, new Date());
    await addMessageToChat(broadcast.chatChannel, user, message.messageId);
    io.to(broadcast.chatChannel).emit("chatNewMessage", { chatId: broadcast.chatChannel, message });
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Handle POST requests to `/api/broadcast/:id/slowmode`. Only the broadcaster
 * may set their chat's slow-mode interval (seconds between a user's messages;
 * 0 disables it).
 */
export const postSlowMode: RestAPI<BroadcastInfo, { id: string }> = async (req, res) => {
  const body = withAuth(zSetSlowMode).safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const broadcast = await getBroadcast(req.params.id);
  if (!broadcast) {
    res.status(404).send({ error: "Broadcast not found" });
    return;
  }
  if (broadcast.broadcasterId !== user.userId) {
    res.status(403).send({ error: "Only the broadcaster can set slow mode" });
    return;
  }

  setSlowMode(broadcast.chatChannel, body.data.payload.seconds);
  res.send(broadcast);
};
