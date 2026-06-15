import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import {
  HINT_PENALTY,
  type PuzzleAttemptResult,
  type PuzzleView,
  type TrainingAttemptResult,
  type TrainingPackEntry,
  type UserAuth,
} from "@gamenite/shared";
import { api } from "./api.ts";
import {
  fetchDailyPuzzle,
  fetchTrainingPack,
  requestPuzzleHint,
  submitPuzzleAttempt,
  submitTrainingAttempt,
} from "./puzzleService.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const AUTH: UserAuth = { username: "ada", password: "pw" };

const nimView: PuzzleView = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { remaining: 6, nextPlayer: 0 },
  createdAt: "2026-06-11T00:00:00.000Z",
};

function asResponse<T>(data: T): AxiosResponse<T> {
  return { data } as AxiosResponse<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchDailyPuzzle", () => {
  it("hits the plain endpoint when nobody is signed in", async () => {
    mockedGet.mockResolvedValueOnce(asResponse(nimView));
    const puzzle = await fetchDailyPuzzle("nim");
    expect(mockedGet).toHaveBeenCalledWith("/api/puzzle/nim");
    expect(puzzle!.date).toBe("2026-06-11");
    expect(puzzle!.viewerAttempt).toBeNull();
  });

  it("asks for the viewer's standing with ?for= when signed in", async () => {
    mockedGet.mockResolvedValueOnce(
      asResponse({ ...nimView, viewerAttempt: { attempted: true, solved: true, rated: true } }),
    );
    const puzzle = await fetchDailyPuzzle("nim", "ada lovelace");
    expect(mockedGet).toHaveBeenCalledWith("/api/puzzle/nim?for=ada+lovelace");
    expect(puzzle!.viewerAttempt).toStrictEqual({ attempted: true, solved: true, rated: true });
  });

  it("returns null on 404 (no puzzle today)", async () => {
    const err = new AxiosError("Not Found");
    err.response = { status: 404 } as AxiosResponse;
    mockedGet.mockRejectedValueOnce(err);
    expect(await fetchDailyPuzzle("nim")).toBeNull();
  });

  it("rethrows other failures for the caller's error state", async () => {
    mockedGet.mockRejectedValueOnce(new Error("boom"));
    await expect(fetchDailyPuzzle("nim")).rejects.toThrow("boom");
  });
});

describe("submitPuzzleAttempt", () => {
  const result: PuzzleAttemptResult = {
    success: true,
    rated: true,
    eloDelta: 12,
    newRating: { rating: 1512, rd: 290, vol: 0.06 },
    streak: { current: 3, best: 5 },
    solutionMove: 3,
  };

  it("echoes the GET's date in the body-auth payload — and never a hint count", async () => {
    mockedPost.mockResolvedValueOnce(asResponse(result));
    const verdict = await submitPuzzleAttempt("nim", AUTH, {
      move: 3,
      timeMs: 6250,
      date: "2026-06-11",
    });
    expect(mockedPost).toHaveBeenCalledWith("/api/puzzle/nim/attempt", {
      auth: AUTH,
      payload: { move: 3, timeMs: 6250, date: "2026-06-11" },
    });
    const body = mockedPost.mock.calls[0][1] as { payload: Record<string, unknown> };
    expect("hintsUsed" in body.payload).toBe(false);
    expect(verdict).toStrictEqual(result);
  });
});

describe("requestPuzzleHint", () => {
  it("posts the pinned date with body auth and returns the revealed move", async () => {
    const hintResult = {
      hintMove: 3,
      explanation: "leave 5",
      eloDelta: -HINT_PENALTY,
      newRating: { rating: 1495, rd: 350, vol: 0.06 },
    };
    mockedPost.mockResolvedValueOnce(asResponse(hintResult));
    const hint = await requestPuzzleHint("nim", AUTH, "2026-06-11");
    expect(mockedPost).toHaveBeenCalledWith("/api/puzzle/nim/hint", {
      auth: AUTH,
      payload: { date: "2026-06-11" },
    });
    expect(hint).toStrictEqual(hintResult);
  });
});

describe("fetchTrainingPack", () => {
  const entries: TrainingPackEntry[] = [
    {
      gameKey: "nim",
      position: { remaining: 5, nextPlayer: 0 },
      sourceMatchId: "match-1",
      createdAt: "2026-06-09T00:30:00.000Z",
    },
  ];

  it("hits the plain endpoint with no query when no options are given", async () => {
    mockedGet.mockResolvedValueOnce(asResponse(entries));
    const pack = await fetchTrainingPack("nim");
    expect(mockedGet).toHaveBeenCalledWith("/api/puzzle/nim/training");
    expect(pack).toStrictEqual(entries);
  });

  it("sends limit and a comma-joined exclude list when given", async () => {
    mockedGet.mockResolvedValueOnce(asResponse(entries));
    await fetchTrainingPack("nim", { limit: 5, exclude: ["match-1", "match-2"] });
    expect(mockedGet).toHaveBeenCalledWith(
      "/api/puzzle/nim/training?limit=5&exclude=match-1%2Cmatch-2",
    );
  });

  it("omits exclude when the list is empty", async () => {
    mockedGet.mockResolvedValueOnce(asResponse(entries));
    await fetchTrainingPack("nim", { limit: 5, exclude: [] });
    expect(mockedGet).toHaveBeenCalledWith("/api/puzzle/nim/training?limit=5");
  });
});

describe("submitTrainingAttempt", () => {
  it("posts the sourceMatchId and move with body auth, returns the verdict", async () => {
    const result: TrainingAttemptResult = {
      success: true,
      solutionMove: 3,
      explanation: "Take 3 to leave them 1.",
    };
    mockedPost.mockResolvedValueOnce(asResponse(result));
    const verdict = await submitTrainingAttempt("nim", AUTH, {
      sourceMatchId: "match-1",
      move: 3,
    });
    expect(mockedPost).toHaveBeenCalledWith("/api/puzzle/nim/training/attempt", {
      auth: AUTH,
      payload: { sourceMatchId: "match-1", move: 3 },
    });
    expect(verdict).toStrictEqual(result);
  });
});
