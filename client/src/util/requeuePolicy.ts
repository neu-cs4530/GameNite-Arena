/**
 * Auto-requeue: pure policy + the sessionStorage carrier between the queue
 * page and the post-game recap.
 *
 * The game-section page records the user's wish (matchSettings); the queue
 * page snapshots it into a QueueSession together with the seat (self or a
 * deployed model); the recap counts the finished game and asks the policy
 * whether to send the seat back to the queue. sessionStorage is a trust
 * boundary (older builds, tampering), so parsing is total, and counting is
 * idempotent per game id because React StrictMode runs mount logic twice.
 */

import type { MatchResultView } from "./types.ts";

/** The decision input: the user's wish plus how far the run has gone. */
export interface RequeuePolicy {
  /** The auto-requeue toggle at the time the queue was joined. */
  enabled: boolean;
  /** Stop after this many games; 0 = no cap. */
  limit: number;
  /** Finished games counted so far in this run. */
  played: number;
}

/** Whether the recap should send this seat back to the queue. */
export function shouldRequeue(policy: RequeuePolicy): boolean {
  if (!policy.enabled) return false;
  return policy.limit === 0 || policy.played < policy.limit;
}

/** Games left before the cap stops the run; null when there is no cap. */
export function remainingGames(policy: RequeuePolicy): number | null {
  if (policy.limit === 0) return null;
  return Math.max(0, policy.limit - policy.played);
}

/** One queue run, as carried through sessionStorage between pages. */
export interface QueueSession {
  gameKey: string;
  rated: boolean;
  /** Present when a deployed model holds the seat. */
  deploymentId?: string;
  modelId?: string;
  modelName?: string;
  /** Snapshot of the per-game match settings at queue time. */
  autoRequeue: boolean;
  requeueLimit: number;
  played: number;
  /** The last game id already counted — makes counting idempotent. */
  lastCountedGameId: string | null;
}

/** sessionStorage key, namespaced per game under the app's prefix. */
export function queueSessionKey(gameKey: string): string {
  return `gnarena:queueSession:${gameKey}`;
}

export function serializeQueueSession(session: QueueSession): string {
  return JSON.stringify(session);
}

/**
 * Total parser. Required fields must have the right types or the whole
 * session is discarded (null) — a half-trusted session could requeue the
 * wrong seat. Counters are clamped to sane values.
 */
export function parseQueueSession(raw: string | null): QueueSession | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.gameKey !== "string" || typeof record.rated !== "boolean") return null;
    if (typeof record.played !== "number") return null;
    const optional = (value: unknown): string | undefined =>
      typeof value === "string" ? value : undefined;
    return {
      gameKey: record.gameKey,
      rated: record.rated,
      deploymentId: optional(record.deploymentId),
      modelId: optional(record.modelId),
      modelName: optional(record.modelName),
      autoRequeue: record.autoRequeue === true,
      requeueLimit:
        typeof record.requeueLimit === "number" && record.requeueLimit > 0
          ? Math.floor(record.requeueLimit)
          : 0,
      played: Number.isInteger(record.played) && record.played > 0 ? record.played : 0,
      lastCountedGameId:
        typeof record.lastCountedGameId === "string" ? record.lastCountedGameId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Counts a finished game exactly once: recounting the same game id (a
 * StrictMode re-mount, a recap re-render) returns the session unchanged.
 */
export function recordGamePlayed(session: QueueSession, gameId: string): QueueSession {
  if (session.lastCountedGameId === gameId) return session;
  return { ...session, played: session.played + 1, lastCountedGameId: gameId };
}

/**
 * Joining a queue either continues the stored run (same game, same mode,
 * same seat — the played count survives a requeue round-trip) or starts a
 * fresh one when anything about the run changed.
 */
export function ensureQueueSession(
  existing: QueueSession | null,
  fresh: QueueSession,
): QueueSession {
  if (
    existing !== null &&
    existing.gameKey === fresh.gameKey &&
    existing.rated === fresh.rated &&
    existing.deploymentId === fresh.deploymentId
  ) {
    return existing;
  }
  return fresh;
}

/** The policy view of a session — what shouldRequeue/remainingGames read. */
export function policyOf(session: QueueSession): RequeuePolicy {
  return { enabled: session.autoRequeue, limit: session.requeueLimit, played: session.played };
}

/** Rebuilds the queue-page URL this session was started from. */
export function queueHrefFromSession(session: QueueSession): string {
  const params = new URLSearchParams();
  params.set("rated", String(session.rated));
  if (session.deploymentId !== undefined) params.set("deploymentId", session.deploymentId);
  if (session.modelId !== undefined) params.set("modelId", session.modelId);
  if (session.modelName !== undefined) params.set("modelName", session.modelName);
  return `/games/queue/${session.gameKey}?${params.toString()}`;
}

/**
 * Whether the viewer's deployed model held a seat in THIS game, and under
 * which entity id. Two independent signals: the model's id in the result's
 * ratingChanges (rated games), or an AI seat in the players list while the
 * session carries a model (casual games never get a result event).
 */
export function modelSeatFor(
  session: QueueSession | null,
  result: MatchResultView | null,
  players: ReadonlyArray<{ isAi?: boolean }>,
): string | null {
  const modelId = session?.modelId;
  if (modelId === undefined) return null;
  const inResult = result?.ratingChanges?.some((c) => c.entityId === modelId) ?? false;
  const aiSeated = players.some((p) => p.isAi === true);
  return inResult || aiSeated ? modelId : null;
}

/**
 * Whether the viewer's OWN deployed model holds an AI seat in THIS game (the
 * "my AI is playing for me" case). An AI seat's `username` is the deployment
 * id, so we match the session's `deploymentId` against the seated AI players
 * — available mid-game, no result event needed. Session-scoped (the tab that
 * ran deploy-and-play carries the QueueSession); the server re-validates
 * ownership on the actual forfeit, so this is only a UI hint.
 */
export function viewerOwnsAiSeat(
  session: QueueSession | null,
  players: ReadonlyArray<{ username: string; isAi?: boolean }>,
): boolean {
  const deploymentId = session?.deploymentId;
  if (deploymentId === undefined) return false;
  return players.some((p) => p.isAi === true && p.username === deploymentId);
}
