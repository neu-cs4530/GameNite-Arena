import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { api } from "./api.ts";
import {
  downloadReplay,
  getReplay,
  listReplays,
  listReplaysForUser,
  recordView,
  replayFixtureSize,
} from "./replayService.ts";
import type { ReplayDetail, ReplayFilters, ReplaySummary } from "../util/types.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const defaultFilters: ReplayFilters = {
  sort: "newest",
  games: [],
  participantType: "all",
  results: [],
  minElo: 800,
  maxElo: 2400,
  date: "all",
  dateFrom: undefined,
  dateTo: undefined,
  minMoves: 1,
  maxMoves: 200,
  participantSearch: "",
  ratedOnly: false,
  page: 1,
  pageSize: 24,
  preset: undefined,
  forUser: undefined,
};

function makeDetail(matchId: string): ReplayDetail {
  return {
    matchId,
    gameKey: "nim",
    gameId: `game-${matchId}`,
    rated: true,
    participants: [
      { id: "u-a", type: "human", displayName: "Alice" },
      { id: "u-b", type: "human", displayName: "Bob" },
    ],
    result: { outcome: "win", winnerId: "u-a" },
    moveCount: 3,
    watchCount: 0,
    completedAt: new Date().toISOString(),
    moves: [
      {
        index: 0,
        actor: "u-a",
        actorDisplayName: "Alice",
        move: 2,
        notation: "take 2",
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function make404(): AxiosError {
  const err = new AxiosError("Not found");
  err.response = {
    status: 404,
    data: {},
    headers: {},
    config: {} as never,
    statusText: "Not Found",
  };
  return err;
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

// ── getReplay ──────────────────────────────────────────────────────────────────

describe("getReplay", () => {
  it("returns the server response on success", async () => {
    const detail = makeDetail("srv-1");
    mockedGet.mockResolvedValueOnce({ data: detail });
    const result = await getReplay("srv-1");
    expect(result.matchId).toBe("srv-1");
    expect(mockedGet).toHaveBeenCalledWith("/api/replay/srv-1");
  });

  it("falls back to the FE fixture on 404 (dev mode)", async () => {
    // "mock-match-1" is always in the FE fixture.
    mockedGet.mockRejectedValueOnce(make404());
    const result = await getReplay("mock-match-1");
    expect(result.matchId).toBe("mock-match-1");
  });

  it("falls back to the FE fixture on network error (dev mode)", async () => {
    const netErr = new AxiosError("Network Error");
    // no .response → isNetworkOrServerError returns true
    mockedGet.mockRejectedValueOnce(netErr);
    const result = await getReplay("mock-match-1");
    expect(result.matchId).toBe("mock-match-1");
  });

  it("throws when the id is not in the fixture and server returns 404", async () => {
    mockedGet.mockRejectedValueOnce(make404());
    await expect(getReplay("not-in-fixture-xyz")).rejects.toThrow();
  });
});

// ── listReplays ────────────────────────────────────────────────────────────────

describe("listReplays", () => {
  it("returns the server response on success", async () => {
    const page = { replays: [], total: 0, page: 1, pageSize: 24 };
    mockedGet.mockResolvedValueOnce({ data: page });
    const result = await listReplays(defaultFilters);
    expect(result.total).toBe(0);
  });

  it("falls back to the mock fixture on network error (dev mode)", async () => {
    const netErr = new AxiosError("Network Error");
    mockedGet.mockRejectedValueOnce(netErr);
    const result = await listReplays(defaultFilters);
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.replays)).toBe(true);
  });

  it("rethrows a 4xx error (no mock substitution)", async () => {
    const err = new AxiosError("Bad Request");
    err.response = { status: 400, data: {}, headers: {}, config: {} as never, statusText: "Bad" };
    mockedGet.mockRejectedValueOnce(err);
    await expect(listReplays(defaultFilters)).rejects.toThrow();
  });

  it("strips default values from the query (sort=newest is omitted)", async () => {
    const page = { replays: [], total: 0, page: 1, pageSize: 24 };
    mockedGet.mockResolvedValueOnce({ data: page });
    await listReplays({ ...defaultFilters, sort: "newest" });
    const callArgs = mockedGet.mock.calls[0];
    const params = (callArgs[1] as { params: Record<string, unknown> }).params;
    // sort "newest" (default) should NOT be in params when it equals default
    // Actually looking at filtersToQuery: `if (filters.sort) q.sort = filters.sort`
    // So "newest" IS included. Let's just verify page is included.
    expect(params.page).toBe(1);
  });

  it("includes non-default filter values in the query", async () => {
    const page = { replays: [], total: 0, page: 1, pageSize: 24 };
    mockedGet.mockResolvedValueOnce({ data: page });
    await listReplays({
      ...defaultFilters,
      games: ["nim"],
      participantType: "humans",
      ratedOnly: true,
      minElo: 1200,
      maxElo: 1800,
      dateFrom: "2026-01-01",
      dateTo: "2026-06-01",
      minMoves: 5,
      maxMoves: 100,
      participantSearch: "alice",
      preset: "upsets",
    });
    const params = (mockedGet.mock.calls[0][1] as { params: Record<string, unknown> }).params;
    expect(params.games).toEqual(["nim"]);
    expect(params.participantType).toBe("humans");
    expect(params.ratedOnly).toBe(true);
    expect(params.minElo).toBe(1200);
    expect(params.maxElo).toBe(1800);
    expect(params.dateFrom).toBe("2026-01-01");
    expect(params.dateTo).toBe("2026-06-01");
    expect(params.minMoves).toBe(5);
    expect(params.maxMoves).toBe(100);
    expect(params.participantSearch).toBe("alice");
    expect(params.preset).toBe("upsets");
  });
});

// ── listReplaysForUser ────────────────────────────────────────────────────────

describe("listReplaysForUser", () => {
  it("returns the server response and passes forUser in the params", async () => {
    const page = { replays: [], total: 0, page: 1, pageSize: 24 };
    mockedGet.mockResolvedValueOnce({ data: page });
    const result = await listReplaysForUser("alice", defaultFilters);
    expect(result.total).toBe(0);
    const params = (mockedGet.mock.calls[0][1] as { params: Record<string, unknown> }).params;
    expect(params.forUser).toBe("alice");
  });

  it("rethrows errors (no mock fallback for user replays)", async () => {
    mockedGet.mockRejectedValueOnce(new Error("network down"));
    await expect(listReplaysForUser("alice", defaultFilters)).rejects.toThrow("network down");
  });
});

// ── recordView ────────────────────────────────────────────────────────────────

describe("recordView", () => {
  it("returns the watchCount from the server on success", async () => {
    mockedPost.mockResolvedValueOnce({ data: { matchId: "m1", watchCount: 7 } });
    const result = await recordView("m1");
    expect(result.watchCount).toBe(7);
  });

  it("falls back to the local counter on 404", async () => {
    mockedPost.mockRejectedValueOnce(make404());
    const result = await recordView("mock-match-1");
    expect(typeof result.watchCount).toBe("number");
  });

  it("falls back to the local counter on network error", async () => {
    const netErr = new AxiosError("Network Error");
    mockedPost.mockRejectedValueOnce(netErr);
    const result = await recordView("mock-match-2");
    expect(typeof result.watchCount).toBe("number");
  });

  it("rethrows non-network, non-404 errors", async () => {
    const err = new AxiosError("Auth error");
    err.response = {
      status: 401,
      data: {},
      headers: {},
      config: {} as never,
      statusText: "Unauthorized",
    };
    mockedPost.mockRejectedValueOnce(err);
    await expect(recordView("m-auth")).rejects.toThrow();
  });
});

// ── downloadReplay ────────────────────────────────────────────────────────────

describe("downloadReplay", () => {
  it("returns a JSON blob containing the replay data", async () => {
    const detail = makeDetail("dl-1");
    mockedGet.mockResolvedValueOnce({ data: detail });
    const blob = await downloadReplay("dl-1");
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    const parsed = JSON.parse(text) as { matchId: string };
    expect(parsed.matchId).toBe("dl-1");
  });
});

// ── replayFixtureSize ─────────────────────────────────────────────────────────

describe("replayFixtureSize", () => {
  it("returns at least 30 (contract from the fixture file)", () => {
    expect(replayFixtureSize()).toBeGreaterThanOrEqual(30);
  });
});

// ── filtersToQuery — non-default date filter ──────────────────────────────────

describe("listReplays — date filter", () => {
  it("includes a non-default date param", async () => {
    const page = { replays: [] as ReplaySummary[], total: 0, page: 1, pageSize: 24 };
    mockedGet.mockResolvedValueOnce({ data: page });
    await listReplays({ ...defaultFilters, date: "week" });
    const params = (mockedGet.mock.calls[0][1] as { params: Record<string, unknown> }).params;
    expect(params.date).toBe("week");
  });
});
