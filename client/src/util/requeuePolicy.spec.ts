import { describe, expect, it } from "vitest";
import {
  ensureQueueSession,
  modelSeatFor,
  parseQueueSession,
  policyOf,
  queueHrefFromSession,
  queueSessionKey,
  recordGamePlayed,
  remainingGames,
  serializeQueueSession,
  shouldRequeue,
  viewerOwnsAiSeat,
  type QueueSession,
} from "./requeuePolicy.ts";

/**
 * Auto-requeue is a promise made on the game-section page and kept on the
 * recap: the policy decides whether the recap may send the player (or
 * their model) back to the queue, and the queue session is the
 * sessionStorage carrier between the two pages. Both must be total over
 * tampered storage and idempotent under React StrictMode double-runs.
 */

function session(over: Partial<QueueSession> = {}): QueueSession {
  return {
    gameKey: "nim",
    rated: true,
    autoRequeue: true,
    requeueLimit: 3,
    played: 0,
    lastCountedGameId: null,
    ...over,
  };
}

describe("shouldRequeue", () => {
  it("never requeues when the toggle is off", () => {
    expect(shouldRequeue({ enabled: false, limit: 0, played: 0 })).toBe(false);
    expect(shouldRequeue({ enabled: false, limit: 5, played: 1 })).toBe(false);
  });

  it("requeues without end when no cap is set", () => {
    expect(shouldRequeue({ enabled: true, limit: 0, played: 0 })).toBe(true);
    expect(shouldRequeue({ enabled: true, limit: 0, played: 999 })).toBe(true);
  });

  it("requeues under the cap and stops exactly at it", () => {
    expect(shouldRequeue({ enabled: true, limit: 3, played: 2 })).toBe(true);
    expect(shouldRequeue({ enabled: true, limit: 3, played: 3 })).toBe(false);
    expect(shouldRequeue({ enabled: true, limit: 3, played: 4 })).toBe(false);
  });
});

describe("remainingGames", () => {
  it("is null when there is no cap", () => {
    expect(remainingGames({ enabled: true, limit: 0, played: 7 })).toBeNull();
  });

  it("counts down to zero and never below", () => {
    expect(remainingGames({ enabled: true, limit: 5, played: 2 })).toBe(3);
    expect(remainingGames({ enabled: true, limit: 5, played: 5 })).toBe(0);
    expect(remainingGames({ enabled: true, limit: 5, played: 9 })).toBe(0);
  });
});

describe("queue session storage", () => {
  it("namespaces the key per game", () => {
    expect(queueSessionKey("nim")).toBe("gnarena:queueSession:nim");
  });

  it("round-trips a full session including the model seat", () => {
    const s = session({
      deploymentId: "d-1",
      modelId: "m-1",
      modelName: "Nimbus",
      played: 2,
      lastCountedGameId: "g-9",
    });
    expect(parseQueueSession(serializeQueueSession(s))).toEqual(s);
  });

  it("returns null for missing or garbled storage", () => {
    expect(parseQueueSession(null)).toBeNull();
    expect(parseQueueSession("{nope")).toBeNull();
    expect(parseQueueSession('"a string"')).toBeNull();
  });

  it("rejects sessions missing required fields rather than guessing", () => {
    expect(parseQueueSession('{"gameKey":"nim"}')).toBeNull();
    expect(parseQueueSession('{"gameKey":"nim","rated":"yes","played":0}')).toBeNull();
    expect(parseQueueSession('{"gameKey":7,"rated":true,"played":0}')).toBeNull();
    expect(parseQueueSession('{"gameKey":"nim","rated":true,"played":"2"}')).toBeNull();
  });

  it("degrades wrong-typed optional fields instead of rejecting the session", () => {
    const parsed = parseQueueSession(
      '{"gameKey":"nim","rated":true,"played":0,"requeueLimit":"lots",' +
        '"deploymentId":7,"lastCountedGameId":9,"autoRequeue":"yes"}',
    );
    expect(parsed).toEqual({
      gameKey: "nim",
      rated: true,
      deploymentId: undefined,
      modelId: undefined,
      modelName: undefined,
      autoRequeue: false,
      requeueLimit: 0,
      played: 0,
      lastCountedGameId: null,
    });
    expect(
      parseQueueSession('{"gameKey":"nim","rated":true,"played":0,"requeueLimit":-2}'),
    ).toEqual(expect.objectContaining({ requeueLimit: 0 }));
  });

  it("sanitizes counters on the way in", () => {
    const tampered = serializeQueueSession(session()).replace('"played":0', '"played":-4');
    expect(parseQueueSession(tampered)?.played).toBe(0);
    const fractional = serializeQueueSession(session()).replace(
      '"requeueLimit":3',
      '"requeueLimit":3.7',
    );
    expect(parseQueueSession(fractional)?.requeueLimit).toBe(3);
    const fractionalPlayed = serializeQueueSession(session()).replace('"played":0', '"played":1.5');
    expect(parseQueueSession(fractionalPlayed)?.played).toBe(0);
  });
});

describe("policyOf", () => {
  it("projects exactly the policy fields the decisions read", () => {
    expect(policyOf(session({ autoRequeue: false, requeueLimit: 10, played: 4 }))).toEqual({
      enabled: false,
      limit: 10,
      played: 4,
    });
  });
});

describe("recordGamePlayed", () => {
  it("counts a finished game once", () => {
    const counted = recordGamePlayed(session(), "g-1");
    expect(counted.played).toBe(1);
    expect(counted.lastCountedGameId).toBe("g-1");
  });

  it("is idempotent for the same game id (StrictMode remount, refetch)", () => {
    const once = recordGamePlayed(session(), "g-1");
    expect(recordGamePlayed(once, "g-1")).toEqual(once);
  });

  it("keeps counting across distinct games", () => {
    const twice = recordGamePlayed(recordGamePlayed(session(), "g-1"), "g-2");
    expect(twice.played).toBe(2);
    expect(twice.lastCountedGameId).toBe("g-2");
  });
});

describe("ensureQueueSession", () => {
  it("keeps the running count when re-entering the same queue", () => {
    const existing = session({ played: 2, lastCountedGameId: "g-2" });
    expect(ensureQueueSession(existing, session())).toBe(existing);
  });

  it("starts over when the mode or seat changed", () => {
    const existing = session({ played: 2 });
    const casual = session({ rated: false });
    expect(ensureQueueSession(existing, casual)).toBe(casual);
    const modelSeat = session({ deploymentId: "d-1", modelId: "m-1" });
    expect(ensureQueueSession(existing, modelSeat)).toBe(modelSeat);
  });

  it("starts fresh when nothing was stored", () => {
    const fresh = session();
    expect(ensureQueueSession(null, fresh)).toBe(fresh);
  });
});

describe("queueHrefFromSession", () => {
  it("rebuilds the self queue link", () => {
    expect(queueHrefFromSession(session({ rated: false }))).toBe("/games/queue/nim?rated=false");
  });

  it("rebuilds the model-seat link with every param", () => {
    const s = session({ deploymentId: "d 1", modelId: "m/1", modelName: "Bot & Co" });
    expect(queueHrefFromSession(s)).toBe(
      "/games/queue/nim?rated=true&deploymentId=d+1&modelId=m%2F1&modelName=Bot+%26+Co",
    );
  });
});

describe("modelSeatFor", () => {
  const players = [{ isAi: undefined }, { isAi: true }];

  it("is null without a session or without a model seat", () => {
    expect(modelSeatFor(null, null, players)).toBeNull();
    expect(modelSeatFor(session(), null, players)).toBeNull();
  });

  it("recognizes the model through its rating change entry", () => {
    const s = session({ modelId: "m-1" });
    const result = {
      winnerId: "m-1",
      outcome: "win" as const,
      ratingChanges: [
        { entityId: "u-1", delta: -8 },
        { entityId: "m-1", delta: 8 },
      ],
    };
    expect(modelSeatFor(s, result, [])).toBe("m-1");
  });

  it("recognizes the model through an AI seat in the players list", () => {
    expect(modelSeatFor(session({ modelId: "m-1" }), null, players)).toBe("m-1");
  });

  it("stays null when neither signal places the model in this game", () => {
    const s = session({ modelId: "m-1" });
    const result = {
      winnerId: "u-2",
      outcome: "win" as const,
      ratingChanges: [
        { entityId: "u-1", delta: -8 },
        { entityId: "u-2", delta: 8 },
      ],
    };
    expect(modelSeatFor(s, result, [{ isAi: false }])).toBeNull();
  });
});

describe("viewerOwnsAiSeat", () => {
  // An AI seat's `username` is the deployment id.
  const aiSeat = { username: "dep-1", isAi: true };
  const human = { username: "alice", isAi: false };

  it("is false without a queue session", () => {
    expect(viewerOwnsAiSeat(null, [aiSeat, human])).toBe(false);
  });

  it("is false when the session carries no deploymentId", () => {
    expect(viewerOwnsAiSeat(session(), [aiSeat, human])).toBe(false);
  });

  it("is true when the session's deployment holds an AI seat in this game", () => {
    expect(viewerOwnsAiSeat(session({ deploymentId: "dep-1" }), [aiSeat, human])).toBe(true);
  });

  it("is false when the session's deployment is NOT a seat in this game", () => {
    expect(viewerOwnsAiSeat(session({ deploymentId: "dep-other" }), [aiSeat, human])).toBe(false);
  });

  it("is false when a same-named seat isn't actually an AI", () => {
    expect(viewerOwnsAiSeat(session({ deploymentId: "dep-1" }), [{ username: "dep-1" }])).toBe(
      false,
    );
  });
});
