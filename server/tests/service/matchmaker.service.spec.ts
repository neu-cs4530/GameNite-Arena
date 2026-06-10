import { beforeEach, describe, expect, it } from "vitest";
import type { GameKey } from "@gamenite/shared";
import { ratingKey } from "../../src/models.ts";
import { RatingRepo } from "../../src/repository.ts";
import { DEFAULT_RATING } from "../../src/services/glicko2.service.ts";
import {
  getPlayerRating,
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
): QueueEntry {
  return { userId, username: userId, gameKey, rating, joinedAt, socketId: `socket-${userId}` };
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
