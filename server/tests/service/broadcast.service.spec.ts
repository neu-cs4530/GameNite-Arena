import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaggedGameView } from "@gamenite/shared";
import type { GameRecord } from "../../src/models.ts";
import { BroadcastRepo, GameRepo } from "../../src/repository.ts";
import {
  broadcastRoom,
  endBroadcast,
  getBroadcast,
  listLiveBroadcasts,
  relayGameViewToBroadcasts,
  startBroadcast,
} from "../../src/services/broadcast.service.ts";
import type { GameServer, UserWithId } from "../../src/types.ts";

const caster: UserWithId = { userId: "u-caster", username: "caster" };
const other: UserWithId = { userId: "u-other", username: "other" };
const now = new Date("2026-06-11T00:00:00.000Z");

const activeGame: GameRecord = {
  type: "nim",
  state: { remaining: 5, nextPlayer: 1 },
  done: false,
  chat: "chat-x",
  players: ["u-caster", "u-2"],
  aiPlayers: [],
  rated: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "u-caster",
};

beforeEach(async () => {
  await BroadcastRepo.clear();
  await GameRepo.set("game-live", activeGame);
});

describe("startBroadcast", () => {
  it("creates a live broadcast for an in-progress game", async () => {
    const broadcast = await startBroadcast(caster, "game-live", 10, now);
    expect(broadcast).toMatchObject({
      gameId: "game-live",
      broadcasterId: "u-caster",
      delaySec: 10,
      status: "live",
      startedAt: now.toISOString(),
    });
    expect(typeof broadcast.broadcastId).toBe("string");
    // A dedicated chat channel is created for the broadcast audience (Story 3.8).
    expect(typeof broadcast.chatChannel).toBe("string");
  });

  it("throws for an unknown game", async () => {
    await expect(startBroadcast(caster, "no-such-game", 0, now)).rejects.toThrow();
  });

  it("throws for a finished game", async () => {
    await GameRepo.set("game-done", { ...activeGame, done: true });
    await expect(startBroadcast(caster, "game-done", 0, now)).rejects.toThrow();
  });

  it("throws for a game that hasn't started (no state)", async () => {
    await GameRepo.set("game-waiting", { ...activeGame, state: undefined });
    await expect(startBroadcast(caster, "game-waiting", 0, now)).rejects.toThrow();
  });
});

describe("getBroadcast", () => {
  it("returns a created broadcast", async () => {
    const created = await startBroadcast(caster, "game-live", 5, now);
    const found = await getBroadcast(created.broadcastId);
    expect(found).toMatchObject({ broadcastId: created.broadcastId, status: "live" });
  });

  it("returns null for an unknown id", async () => {
    expect(await getBroadcast("nope")).toBeNull();
  });
});

describe("listLiveBroadcasts", () => {
  it("returns only live broadcasts, most recent first", async () => {
    const first = await startBroadcast(caster, "game-live", 0, new Date("2026-06-11T00:00:00Z"));
    const second = await startBroadcast(caster, "game-live", 0, new Date("2026-06-11T01:00:00Z"));
    await endBroadcast(caster, first.broadcastId, now);

    const live = await listLiveBroadcasts();
    expect(live.map((b) => b.broadcastId)).toEqual([second.broadcastId]);
  });
});

describe("endBroadcast", () => {
  it("lets the broadcaster end their broadcast", async () => {
    const created = await startBroadcast(caster, "game-live", 0, now);
    const ended = await endBroadcast(caster, created.broadcastId, new Date("2026-06-11T02:00:00Z"));
    expect(ended).toMatchObject({ status: "ended", endedAt: "2026-06-11T02:00:00.000Z" });
  });

  it("rejects a non-broadcaster", async () => {
    const created = await startBroadcast(caster, "game-live", 0, now);
    await expect(endBroadcast(other, created.broadcastId, now)).rejects.toThrow();
  });

  it("returns null for an unknown id", async () => {
    expect(await endBroadcast(caster, "nope", now)).toBeNull();
  });
});

describe("relayGameViewToBroadcasts (delayed relay)", () => {
  const view = { kind: "nim", remaining: 5 } as unknown as TaggedGameView;

  function mockIo(): { io: GameServer; emit: ReturnType<typeof vi.fn> } {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) } as unknown as GameServer;
    return { io, emit };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits to the broadcast room only after the broadcaster's delay elapses", async () => {
    const broadcast = await startBroadcast(caster, "game-live", 5, now);
    vi.useFakeTimers();
    const { io, emit } = mockIo();

    await relayGameViewToBroadcasts(io, "game-live", view);
    expect(emit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4999);
    expect(emit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(io.to).toHaveBeenCalledWith(broadcastRoom(broadcast.broadcastId));
    expect(emit).toHaveBeenCalledWith("broadcastStateUpdated", {
      broadcastId: broadcast.broadcastId,
      view,
    });
  });

  it("does not relay to broadcasts of a different game", async () => {
    await startBroadcast(caster, "game-live", 0, now);
    vi.useFakeTimers();
    const { io, emit } = mockIo();

    await relayGameViewToBroadcasts(io, "some-other-game", view);
    await vi.advanceTimersByTimeAsync(1000);
    expect(emit).not.toHaveBeenCalled();
  });
});
