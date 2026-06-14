import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReplayDetail } from "@gamenite/shared";
import type { GameRecord } from "../../src/models.ts";
import { GameRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  InMemoryReplayStore,
  makeDefaultStore,
  replaceStoreForTests,
} from "../../src/services/replay.service.ts";
import { followUser, getFollowerFeed, unfollowUser } from "../../src/services/follow.service.ts";
import type { UserWithId } from "../../src/types.ts";

let user0: UserWithId;
let user1: UserWithId;

beforeEach(async () => {
  // setup.ts reseeds users (following: []) before each test.
  const u0 = await getUserByUsername("user0");
  const u1 = await getUserByUsername("user1");
  if (!u0 || !u1) throw new Error("seeded users missing");
  user0 = u0;
  user1 = u1;
});

afterEach(() => {
  replaceStoreForTests(makeDefaultStore());
});

describe("followUser / unfollowUser / getFollowing", () => {
  it("follows an account and lists it", async () => {
    const following = await followUser(user0, "user1");
    expect(following.map((u) => u.username)).toContain("user1");
  });

  it("is idempotent — following twice keeps a single entry", async () => {
    await followUser(user0, "user1");
    const following = await followUser(user0, "user1");
    expect(following.filter((u) => u.username === "user1")).toHaveLength(1);
  });

  it("unfollows an account", async () => {
    await followUser(user0, "user1");
    const following = await unfollowUser(user0, "user1");
    expect(following.map((u) => u.username)).not.toContain("user1");
  });

  it("ignores self-follow", async () => {
    const following = await followUser(user0, "user0");
    expect(following).toHaveLength(0);
  });

  it("throws when following an unknown user", async () => {
    await expect(followUser(user0, "ghost")).rejects.toThrow();
  });
});

describe("getFollowerFeed", () => {
  it("surfaces the live game a followed account is in", async () => {
    await GameRepo.clear();
    const activeGame: GameRecord = {
      type: "nim",
      state: { remaining: 5, nextPlayer: 1 },
      done: false,
      chat: "chat-x",
      players: [user0.userId, user1.userId],
      aiPlayers: [],
      rated: true,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: user0.userId,
    };
    await GameRepo.set("game-live", activeGame);

    await followUser(user0, "user1");
    const feed = await getFollowerFeed(user0);

    const entry = feed.following.find((f) => f.user.username === "user1");
    expect(entry?.currentGame?.gameId).toBe("game-live");
  });

  it("reports null currentGame when a followed account isn't playing", async () => {
    await GameRepo.clear();
    await followUser(user0, "user1");
    const feed = await getFollowerFeed(user0);
    expect(feed.following.find((f) => f.user.username === "user1")?.currentGame).toBeNull();
  });

  it("includes replays featuring followed accounts and excludes others", async () => {
    replaceStoreForTests(
      new InMemoryReplayStore([replayWith("m-follow", "user1"), replayWith("m-other", "user3")]),
    );
    await followUser(user0, "user1");

    const feed = await getFollowerFeed(user0);
    const ids = feed.replays.map((r) => r.matchId);
    expect(ids).toContain("m-follow");
    expect(ids).not.toContain("m-other");
  });
});

/** A minimal completed replay whose first participant has the given username. */
function replayWith(matchId: string, username: string): ReplayDetail {
  return {
    matchId,
    gameId: `g-${matchId}`,
    gameKey: "nim",
    rated: true,
    completedAt: "2026-06-10T00:00:00.000Z",
    moveCount: 1,
    watchCount: 0,
    participants: [
      { id: `id-${username}`, type: "human", displayName: username, username },
      { id: "id-bot", type: "ai", displayName: "Botty" },
    ],
    result: { outcome: "win", winnerId: `id-${username}` },
    moves: [],
  };
}
