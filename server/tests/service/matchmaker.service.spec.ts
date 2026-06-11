import { beforeEach, describe, expect, it } from "vitest";
import type { GameKey } from "@gamenite/shared";
import { ratingKey } from "../../src/models.ts";
import { RatingRepo } from "../../src/repository.ts";
import { DEFAULT_RATING } from "../../src/services/glicko2.service.ts";
import {
  getPlayerRating,
  getQueueCounts,
  getQueueSnapshot,
  joinQueue,
  leaveQueue,
  runMatchmakingTick,
  MAX_WAIT_MS,
  TICK_INTERVAL_MS,
  type QueueEntry,
} from "../../src/services/matchmaker.service.ts";

function entry(
  userId: string,
  rating: number,
  joinedAt: Date,
  gameKey: GameKey = "nim",
  rated = true,
): QueueEntry {
  return {
    userId,
    username: userId,
    gameKey,
    rating,
    rated,
    joinedAt,
    socketId: `socket-${userId}`,
  };
}

beforeEach(async () => {
  await RatingRepo.clear();
});

describe("joinQueue / leaveQueue / runMatchmakingTick", () => {
  it("matches two players within the initial window right away", () => {
    const now = new Date();
    joinQueue(entry("alice", 1500, now));
    joinQueue(entry("bob", 1550, now)); // diff = 50, within the initial window

    const { matched, timedOut } = runMatchmakingTick(now);

    expect(matched).toHaveLength(1);
    expect(matched[0].map((e) => e.userId).sort()).toEqual(["alice", "bob"]);
    expect(timedOut).toHaveLength(0);
  });

  it("does not match players outside the window until it expands enough", () => {
    const now = new Date();
    joinQueue(entry("carol", 1500, now));
    joinQueue(entry("dave", 1700, now)); // diff = 200, outside the initial window of 100

    const tooSoon = runMatchmakingTick(now);
    expect(tooSoon.matched).toHaveLength(0);

    // after 2 ticks the window has grown to 100 + 50*2 = 200, which now covers the gap
    const later = new Date(now.getTime() + 2 * TICK_INTERVAL_MS);
    const expanded = runMatchmakingTick(later);
    expect(expanded.matched).toHaveLength(1);
    expect(expanded.matched[0].map((e) => e.userId).sort()).toEqual(["carol", "dave"]);
  });

  it("matches the closest-rated pair when more than one pair is eligible", () => {
    const now = new Date();
    joinQueue(entry("p1", 1500, now));
    joinQueue(entry("p2", 1520, now)); // closest to p1 (diff 20)
    joinQueue(entry("p3", 1580, now)); // diff to p1 is 80, diff to p2 is 60

    const { matched } = runMatchmakingTick(now);

    expect(matched).toHaveLength(1);
    expect(matched[0].map((e) => e.userId).sort()).toEqual(["p1", "p2"]);

    // p3 is left in the queue, unmatched
    leaveQueue("p3", "nim");
  });

  it("never matches players queued for different games", () => {
    const now = new Date();
    joinQueue(entry("x", 1500, now, "nim"));
    joinQueue(entry("y", 1500, now, "guess")); // same rating, but a different game

    const { matched } = runMatchmakingTick(now);
    expect(matched).toHaveLength(0);

    leaveQueue("x", "nim");
    leaveQueue("y", "guess");
  });

  it("never matches a rated-seeker with an unrated-seeker", () => {
    const now = new Date();
    joinQueue(entry("ranked", 1500, now, "nim", true));
    joinQueue(entry("casual", 1500, now, "nim", false)); // same rating/game, different mode

    const { matched } = runMatchmakingTick(now);
    expect(matched).toHaveLength(0);

    leaveQueue("ranked", "nim");
    leaveQueue("casual", "nim");
  });

  it("times out a player who has waited at least MAX_WAIT_MS", () => {
    const now = new Date();
    joinQueue(entry("lonely", 1500, now));

    const later = new Date(now.getTime() + MAX_WAIT_MS);
    const { matched, timedOut } = runMatchmakingTick(later);

    expect(matched).toHaveLength(0);
    expect(timedOut).toHaveLength(1);
    expect(timedOut[0].userId).toBe("lonely");
  });

  it("ignores a duplicate joinQueue call for the same player and game", () => {
    const now = new Date();
    joinQueue(entry("dup", 1500, now));
    joinQueue(entry("dup", 1500, now));

    const later = new Date(now.getTime() + MAX_WAIT_MS);
    const { timedOut } = runMatchmakingTick(later);

    expect(timedOut).toHaveLength(1);
  });

  it("lets a player leave the queue before they're matched", () => {
    const now = new Date();
    joinQueue(entry("a", 1500, now));
    joinQueue(entry("b", 1500, now));
    leaveQueue("a", "nim");

    const { matched } = runMatchmakingTick(now);
    expect(matched).toHaveLength(0);

    leaveQueue("b", "nim");
  });
});

describe("getPlayerRating", () => {
  it("returns the default rating for a player who hasn't played", async () => {
    const rating = await getPlayerRating("new-player", "nim");
    expect(rating).toBe(DEFAULT_RATING);
  });

  it("returns a player's stored rating", async () => {
    await RatingRepo.set(ratingKey({ entityType: "human", entityId: "vet", gameKey: "nim" }), {
      entityId: "vet",
      entityType: "human",
      gameKey: "nim",
      rating: 1700,
      rd: 80,
      vol: 0.05,
      gamesPlayed: 12,
      lastUpdatedAt: new Date().toISOString(),
    });

    const rating = await getPlayerRating("vet", "nim");
    expect(rating).toBe(1700);
  });
});

describe("getQueueSnapshot", () => {
  it("reports each queued player's game, rated mode, and current rating window", () => {
    const now = new Date();
    joinQueue(entry("snap-a", 1500, now, "nim", true));
    joinQueue(entry("snap-b", 1500, now, "guess", false));

    const snapshot = getQueueSnapshot(now);

    expect(snapshot.find((e) => e.socketId === "socket-snap-a")).toEqual({
      socketId: "socket-snap-a",
      gameKey: "nim",
      window: 100, // INITIAL_WINDOW, no time has passed
    });
    expect(snapshot.find((e) => e.socketId === "socket-snap-b")).toEqual({
      socketId: "socket-snap-b",
      gameKey: "guess",
      window: 100,
    });

    leaveQueue("snap-a", "nim");
    leaveQueue("snap-b", "guess");
  });

  it("grows the window the longer a player has been queued", () => {
    const now = new Date();
    joinQueue(entry("snap-c", 1500, now, "nim"));

    // after 2 ticks the window has grown to 100 + 50*2 = 200
    const later = new Date(now.getTime() + 2 * TICK_INTERVAL_MS);
    const snapshot = getQueueSnapshot(later);

    expect(snapshot.find((e) => e.socketId === "socket-snap-c")?.window).toBe(200);

    leaveQueue("snap-c", "nim");
  });
});

describe("getQueueCounts", () => {
  it("breaks down the queue by game and rated mode", () => {
    const before = getQueueCounts();

    const now = new Date();
    joinQueue(entry("count-a", 1500, now, "nim", true));
    joinQueue(entry("count-b", 1500, now, "nim", true));
    joinQueue(entry("count-c", 1500, now, "nim", false));
    joinQueue(entry("count-d", 1500, now, "guess", false));

    const after = getQueueCounts();

    expect(after.nim.rated - before.nim.rated).toBe(2);
    expect(after.nim.unrated - before.nim.unrated).toBe(1);
    expect(after.guess.unrated - before.guess.unrated).toBe(1);
    expect(after.guess.rated).toBe(before.guess.rated);

    leaveQueue("count-a", "nim");
    leaveQueue("count-b", "nim");
    leaveQueue("count-c", "nim");
    leaveQueue("count-d", "guess");
  });
});
