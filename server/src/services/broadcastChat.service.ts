/**
 * Broadcast chat moderation: per-channel rate limiting and slow mode (Story
 * 3.8). State is in-memory and per-process — appropriate for live moderation,
 * and reset on restart along with the broadcast itself.
 */

/** At most this many messages per user, per channel, within the window. */
export const RATE_LIMIT_MAX = 5;
/** Sliding rate-limit window, in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 10_000;

/** Per-channel slow-mode interval (seconds between a user's messages); 0 = off. */
const slowModeByChannel = new Map<string, number>();
/** Recent send timestamps per `${channelId}:${userId}` for windowed checks. */
const sendHistory = new Map<string, number[]>();

function historyKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

/** Set a channel's slow-mode interval in seconds (0 disables it). */
export function setSlowMode(channelId: string, seconds: number): void {
  if (seconds <= 0) slowModeByChannel.delete(channelId);
  else slowModeByChannel.set(channelId, seconds);
}

/** The channel's current slow-mode interval in seconds (0 if unset). */
export function getSlowMode(channelId: string): number {
  return slowModeByChannel.get(channelId) ?? 0;
}

export type ChatGateDecision =
  | { ok: true }
  | { ok: false; reason: "rate-limit" | "slow-mode"; retryAfterMs: number };

/**
 * Decide whether `userId` may post in `channelId` at `now` (ms epoch),
 * enforcing slow mode first, then the rate-limit window. Records the send when
 * allowed so repeated calls advance the limits.
 *
 * @param channelId - The broadcast's chat channel
 * @param userId - The author
 * @param now - Current time in epoch milliseconds
 */
export function checkAndRecordSend(
  channelId: string,
  userId: string,
  now: number,
): ChatGateDecision {
  const key = historyKey(channelId, userId);
  const recent = (sendHistory.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  const slowMs = getSlowMode(channelId) * 1000;
  const last = recent.at(-1);
  if (slowMs > 0 && last !== undefined && now - last < slowMs) {
    return { ok: false, reason: "slow-mode", retryAfterMs: slowMs - (now - last) };
  }

  if (recent.length >= RATE_LIMIT_MAX) {
    return {
      ok: false,
      reason: "rate-limit",
      retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - recent[0]),
    };
  }

  recent.push(now);
  sendHistory.set(key, recent);
  return { ok: true };
}

/** Clear all in-memory moderation state. For tests. */
export function resetForTests(): void {
  slowModeByChannel.clear();
  sendHistory.clear();
}
