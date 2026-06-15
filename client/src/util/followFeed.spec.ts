import { describe, expect, it } from "vitest";
import type { FollowFeed, FollowedUserStatus, GameInfo, SafeUserInfo } from "@gamenite/shared";
import type { ReplaySummary } from "./types.ts";
import { activeStories, feedReplaysChronological, isFollowing } from "./followFeed.ts";

function user(username: string): SafeUserInfo {
  return { username, display: username.toUpperCase(), createdAt: new Date(0) };
}

function status(username: string, playing: boolean): FollowedUserStatus {
  return {
    user: user(username),
    currentGame: playing ? ({ gameId: `g-${username}`, type: "nim" } as GameInfo) : null,
  };
}

function replay(matchId: string, completedAt: string): ReplaySummary {
  return {
    matchId,
    gameKey: "nim",
    rated: true,
    participants: [],
    result: { outcome: "draw" },
    moveCount: 1,
    watchCount: 0,
    completedAt,
  };
}

describe("activeStories", () => {
  it("keeps only followed accounts currently in a game", () => {
    const feed: FollowFeed = {
      following: [status("a", true), status("b", false), status("c", true)],
      replays: [],
    };
    expect(activeStories(feed).map((s) => s.user.username)).toEqual(["a", "c"]);
  });
});

describe("feedReplaysChronological", () => {
  it("sorts replays newest-first by completedAt without mutating input", () => {
    const replays = [
      replay("old", "2026-06-10T00:00:00.000Z"),
      replay("new", "2026-06-14T00:00:00.000Z"),
      replay("mid", "2026-06-12T00:00:00.000Z"),
    ];
    const feed: FollowFeed = { following: [], replays };
    expect(feedReplaysChronological(feed).map((r) => r.matchId)).toEqual(["new", "mid", "old"]);
    expect(replays[0].matchId).toBe("old"); // original order untouched
  });
});

describe("isFollowing", () => {
  it("matches by username", () => {
    const following = [user("alice"), user("bob")];
    expect(isFollowing(following, "bob")).toBe(true);
    expect(isFollowing(following, "carol")).toBe(false);
  });
});
