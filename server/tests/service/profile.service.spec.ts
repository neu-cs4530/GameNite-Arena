import { beforeEach, describe, expect, it } from "vitest";
import type { GameKey } from "@gamenite/shared";
import { ratingKey, type MatchRecord, type UserRecord } from "../../src/models.ts";
import {
  DeploymentRepo,
  MatchRepo,
  ModelRepo,
  PuzzleAttemptRepo,
  RatingRepo,
  UserRepo,
  WatchCountRepo,
} from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { buildProfileSummary } from "../../src/services/profile.service.ts";
import { dayBefore, todayYmd } from "../../src/services/puzzleStreak.util.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * Aggregate profile summary, built ONLY from the real repos: the match
 * archive, the rating repo, the model repo, watch counts, and the puzzle
 * attempt log. The seeded starter users (tests/setup.ts) play the humans.
 * ------------------------------------------------------------------------- */

let me: UserWithId; // user0 — the profile under test
let rival: UserWithId; // user1 — the opponent in most fixtures

const human = (id: string, displayName: string) => ({ id, type: "human" as const, displayName });
const ai = (id: string, displayName: string) => ({ id, type: "ai" as const, displayName });

/** Seeds one archived match under a chosen id; defaults to an unrated nim draw between me and rival. */
async function seedMatch(matchId: string, overrides: Partial<MatchRecord> = {}): Promise<void> {
  await MatchRepo.set(matchId, {
    gameId: `game-${matchId}`,
    gameKey: "nim",
    rated: false,
    participants: [human(me.userId, "Me"), human(rival.userId, "Rival")],
    moves: [],
    result: { outcome: "draw" },
    createdAt: "2026-06-08T12:00:00.000Z",
    completedAt: "2026-06-08T12:00:00.000Z",
    ...overrides,
  });
}

/** Seeds one RatingRecord; defaults describe a settled (non-provisional) human nim rating. */
async function seedRating(
  entityId: string,
  overrides: {
    gameKey?: GameKey;
    entityType?: "human" | "ai";
    rating?: number;
    rd?: number;
    gamesPlayed?: number;
  } = {},
): Promise<void> {
  const gameKey = overrides.gameKey ?? "nim";
  const entityType = overrides.entityType ?? "human";
  await RatingRepo.set(ratingKey({ entityType, entityId, gameKey }), {
    entityId,
    entityType,
    gameKey,
    rating: overrides.rating ?? 1500,
    rd: overrides.rd ?? 80,
    vol: 0.06,
    gamesPlayed: overrides.gamesPlayed ?? 10,
    lastUpdatedAt: "2026-06-08T00:00:00.000Z",
  });
}

async function seedModel(
  modelId: string,
  ownerId: string,
  displayName: string,
  gameKey: GameKey = "nim",
): Promise<void> {
  await ModelRepo.set(modelId, {
    userId: ownerId,
    gameKey,
    displayName,
    sourceRef: "test-source",
    visibility: "private",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
}

/** Seeds a deployment of a model. The deployment id is the AI seat id that
 * appears in a match's `result.winnerId` (game.players holds deployment ids
 * for AI seats), distinct from the model id used as the participant id. */
async function seedDeployment(
  deploymentId: string,
  modelId: string,
  ownerId: string,
  gameKey: GameKey = "nim",
): Promise<void> {
  await DeploymentRepo.set(deploymentId, {
    modelId,
    userId: ownerId,
    gameKey,
    displayName: "deploy",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
}

/** Seeds one puzzle attempt; defaults to my successful unrated human attempt. */
async function seedAttempt(args: {
  puzzleId: string;
  attempterId?: string;
  attempterType?: "human" | "ai";
  success?: boolean;
  rated?: boolean;
  timeMs?: number;
  eloDelta?: number;
  createdAt?: string;
}): Promise<void> {
  await PuzzleAttemptRepo.add({
    puzzleId: args.puzzleId,
    attemptedBy: { id: args.attempterId ?? me.userId, type: args.attempterType ?? "human" },
    success: args.success ?? true,
    // The rated flag is recent; records written before it MUST stay absent so
    // the eloDelta fallback is exercised.
    ...(args.rated !== undefined ? { rated: args.rated } : {}),
    timeMs: args.timeMs ?? 1000,
    hintsUsed: 0,
    eloDelta: args.eloDelta ?? 0,
    createdAt: args.createdAt ?? "2026-06-08T12:00:00.000Z",
  });
}

async function setPuzzleState(
  userId: string,
  updates: Partial<Pick<UserRecord, "puzzleRatings" | "puzzleStreak">>,
): Promise<void> {
  const record = await UserRepo.get(userId);
  await UserRepo.set(userId, { ...record, ...updates });
}

const gridSum = (grid: number[][]): number => grid.flat().reduce((sum, n) => sum + n, 0);

beforeEach(async () => {
  // tests/setup.ts clears MatchRepo + WatchCountRepo and reseeds users; the
  // remaining repos this service scans are cleared here.
  await RatingRepo.clear();
  await ModelRepo.clear();
  await DeploymentRepo.clear();
  await PuzzleAttemptRepo.clear();
  me = (await getUserByUsername("user0"))!;
  rival = (await getUserByUsername("user1"))!;
});

describe("buildProfileSummary identity", () => {
  it("returns null for an unknown username", async () => {
    expect(await buildProfileSummary("nobody-here")).toBeNull();
  });

  it("serves all-empty honest data for a user with no activity anywhere", async () => {
    const summary = (await buildProfileSummary("user3"))!;

    expect(summary.user.username).toBe("user3");
    expect(summary.user.display).toBe("Frau Drei");
    expect(summary.user.createdAt).toBeInstanceOf(Date);

    expect(summary.general.record).toEqual({ totalMatches: 0, wins: 0, losses: 0, draws: 0 });
    expect(summary.general.peakElo).toBeNull();
    expect(summary.general.averageElo).toBeNull();
    expect(summary.general.bestAi).toBeNull();
    expect(summary.general.mostViewed).toBeNull();
    expect(summary.general.heatmap).toHaveLength(7);
    expect(summary.general.heatmap.every((row) => row.length === 24)).toBe(true);
    expect(gridSum(summary.general.heatmap)).toBe(0);

    expect(summary.perGame).toEqual([]);

    expect(summary.puzzles.overallRating).toBeNull();
    expect(summary.puzzles.perGame).toEqual([]);
    expect(summary.puzzles.streak).toEqual({ current: 0, best: 0, lastSolvedAt: undefined });
    expect(summary.puzzles.recentAttempts).toEqual([]);
  });
});

describe("match aggregates", () => {
  it("classifies W/L/D: forfeits and abandonments with a winner are decided", async () => {
    const result = (winnerId: string | undefined, outcome: MatchRecord["result"]["outcome"]) => ({
      winnerId,
      outcome,
    });
    await seedMatch("m-win", { result: result(me.userId, "win") });
    await seedMatch("m-loss", { result: result(rival.userId, "win") });
    await seedMatch("m-forfeit-loss", { result: result(rival.userId, "forfeit") });
    await seedMatch("m-abandoned-loss", { result: result(rival.userId, "abandoned") });
    await seedMatch("m-forfeit-win", { result: result(me.userId, "forfeit") });
    await seedMatch("m-draw", { result: result(undefined, "draw") });
    // undecided: nobody won, nobody lost — counts toward totals only
    await seedMatch("m-undecided", { result: result(undefined, "abandoned") });
    // not my match — must not leak into my record
    await seedMatch("m-not-mine", {
      participants: [human(rival.userId, "Rival"), human("someone-else", "Else")],
      result: result(rival.userId, "win"),
    });

    const summary = (await buildProfileSummary("user0"))!;

    const expected = { totalMatches: 7, wins: 2, losses: 3, draws: 1 };
    expect(summary.general.record).toEqual(expected);
    expect(summary.perGame).toHaveLength(1);
    expect(summary.perGame[0].gameKey).toBe("nim");
    expect(summary.perGame[0].record).toEqual(expected);
  });

  it("buckets the heatmap by UTC weekday (row) and hour (column)", async () => {
    // 2026-06-10 is a Wednesday → row 3; 14:30 UTC → column 14
    await seedMatch("m-wed", { completedAt: "2026-06-10T14:30:00.000Z" });
    // 2026-06-07 is a Sunday → row 0; 05:00 UTC → column 5
    await seedMatch("m-sun", { completedAt: "2026-06-07T05:00:00.000Z" });

    const summary = (await buildProfileSummary("user0"))!;

    for (const grid of [summary.general.heatmap, summary.perGame[0].heatmap]) {
      expect(grid[3][14]).toBe(1);
      expect(grid[0][5]).toBe(1);
      expect(gridSum(grid)).toBe(2);
    }
  });

  it("lists perGame in canonical order and includes rating-only games with zeroed records", async () => {
    // guess: rating record but no matches; nim: a match but no rating record
    await seedRating(me.userId, { gameKey: "guess", rating: 1601 });
    await seedMatch("m-nim", { result: { winnerId: me.userId, outcome: "win" } });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.perGame.map((g) => g.gameKey)).toEqual(["nim", "guess"]);
    const guess = summary.perGame[1];
    expect(guess.record).toEqual({ totalMatches: 0, wins: 0, losses: 0, draws: 0 });
    expect(guess.mostViewed).toBeNull();
    expect(gridSum(guess.heatmap)).toBe(0);
    expect(guess.rating.current).toBe(1601);
  });
});

describe("rating stats (elo walk)", () => {
  it("reconstructs peak/average by walking rated deltas in completedAt order, per game", async () => {
    // Inserted out of chronological order on purpose: the walk must sort by
    // completedAt. Chronologically: 1500 +30 → 1530, then -20 → 1510.
    await seedMatch("m-late", {
      rated: true,
      completedAt: "2026-06-02T00:00:00.000Z",
      result: {
        winnerId: rival.userId,
        outcome: "win",
        ratingChanges: [
          { entityId: me.userId, delta: -20 },
          { entityId: rival.userId, delta: 20 },
        ],
      },
    });
    await seedMatch("m-early", {
      rated: true,
      completedAt: "2026-06-01T00:00:00.000Z",
      result: {
        winnerId: me.userId,
        outcome: "win",
        ratingChanges: [
          { entityId: me.userId, delta: 30 },
          { entityId: rival.userId, delta: -30 },
        ],
      },
    });
    // a different game's walk must not bleed into nim's
    await seedMatch("m-guess", {
      gameKey: "guess",
      rated: true,
      completedAt: "2026-06-03T00:00:00.000Z",
      result: {
        winnerId: me.userId,
        outcome: "win",
        ratingChanges: [{ entityId: me.userId, delta: 500 }],
      },
    });
    await seedRating(me.userId, { rating: 1510, rd: 80, gamesPlayed: 2 });

    const summary = (await buildProfileSummary("user0"))!;

    const nim = summary.perGame.find((g) => g.gameKey === "nim")!;
    expect(nim.rating).toEqual({
      current: 1510,
      peak: 1530, // max of the walk [1530, 1510]
      average: 1520, // round((1530 + 1510) / 2)
      gamesPlayed: 2,
      provisional: false,
    });

    const guess = summary.perGame.find((g) => g.gameKey === "guess")!;
    expect(guess.rating.peak).toBe(2000);
    expect(guess.rating.average).toBe(2000);
    expect(guess.rating.current).toBeNull();
  });

  it("includes current in the peak and skips unrated matches and other players' deltas", async () => {
    await seedMatch("m-rated-loss", {
      rated: true,
      completedAt: "2026-06-01T00:00:00.000Z",
      result: {
        winnerId: rival.userId,
        outcome: "win",
        ratingChanges: [{ entityId: me.userId, delta: -20 }],
      },
    });
    // unrated — its deltas must never enter the walk
    await seedMatch("m-unrated", {
      rated: false,
      completedAt: "2026-06-02T00:00:00.000Z",
      result: {
        winnerId: me.userId,
        outcome: "win",
        ratingChanges: [{ entityId: me.userId, delta: 100 }],
      },
    });
    // rated, but only the opponent's rating moved — no walk point for me
    await seedMatch("m-no-delta-for-me", {
      rated: true,
      completedAt: "2026-06-03T00:00:00.000Z",
      result: {
        winnerId: rival.userId,
        outcome: "win",
        ratingChanges: [{ entityId: rival.userId, delta: 15 }],
      },
    });
    await seedRating(me.userId, { rating: 1495, rd: 200, gamesPlayed: 1 });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.perGame[0].rating).toEqual({
      current: 1495,
      peak: 1495, // current beats the walk's lone 1480
      average: 1480,
      gamesPlayed: 1,
      provisional: true, // rd 200 > 150
    });
  });

  it("serves honest nulls for a player with only unrated matches and no rating record", async () => {
    await seedMatch("m-casual", { result: { winnerId: me.userId, outcome: "win" } });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.perGame[0].rating).toEqual({
      current: null,
      peak: null,
      average: null,
      gamesPlayed: 0,
      provisional: true,
    });
  });
});

describe("most viewed replay", () => {
  it("picks the user's match with the highest watch count; missing counts read as 0", async () => {
    await seedMatch("m-old", { completedAt: "2026-06-01T00:00:00.000Z" });
    await seedMatch("m-hot", { completedAt: "2026-06-02T00:00:00.000Z" });
    await seedMatch("m-uncounted", { completedAt: "2026-06-03T00:00:00.000Z" });
    await WatchCountRepo.set("m-old", 5);
    await WatchCountRepo.set("m-hot", 9);

    const summary = (await buildProfileSummary("user0"))!;

    const hero = summary.general.mostViewed!;
    expect(hero.matchId).toBe("m-hot");
    expect(hero.watchCount).toBe(9);
    expect(hero.gameKey).toBe("nim");
    expect(hero.moveCount).toBe(0);
    expect(hero.completedAt).toBe("2026-06-02T00:00:00.000Z");
    // human participants resolve their profile-linkable usernames
    expect(hero.participants.map((p) => p.username)).toEqual(["user0", "user1"]);
  });

  it("breaks watch-count ties toward the newer match", async () => {
    await seedMatch("m-tied-old", { completedAt: "2026-06-01T00:00:00.000Z" });
    await seedMatch("m-tied-new", { completedAt: "2026-06-02T00:00:00.000Z" });
    await WatchCountRepo.set("m-tied-old", 9);
    await WatchCountRepo.set("m-tied-new", 9);

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.general.mostViewed!.matchId).toBe("m-tied-new");
  });

  it("scopes per-game heroes to that game while general spans all games", async () => {
    await seedMatch("m-nim", { gameKey: "nim", completedAt: "2026-06-01T00:00:00.000Z" });
    await seedMatch("m-guess", { gameKey: "guess", completedAt: "2026-06-02T00:00:00.000Z" });
    await WatchCountRepo.set("m-nim", 3);
    await WatchCountRepo.set("m-guess", 7);

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.general.mostViewed!.matchId).toBe("m-guess");
    expect(summary.perGame.find((g) => g.gameKey === "nim")!.mostViewed!.matchId).toBe("m-nim");
    expect(summary.perGame.find((g) => g.gameKey === "guess")!.mostViewed!.matchId).toBe("m-guess");
  });
});

describe("bestAi", () => {
  it("picks the user's highest-rated model with W/L counted from the archive", async () => {
    await seedModel("model-a", me.userId, "Alpha");
    await seedModel("model-b", me.userId, "Bravo");
    await seedModel("model-unrated", me.userId, "Camo");
    await seedModel("model-theirs", rival.userId, "Delta");
    await seedRating("model-a", { entityType: "ai", rating: 1600, gamesPlayed: 10 });
    await seedRating("model-b", { entityType: "ai", rating: 1700, gamesPlayed: 4 });
    await seedRating("model-theirs", { entityType: "ai", rating: 2000, gamesPlayed: 50 });
    // Bravo was deployed; its deployment id is the seat id production writes
    // into result.winnerId, NOT the model id.
    await seedDeployment("deploy-b", "model-b", me.userId);

    const vsRival = (winnerId: string, outcome: MatchRecord["result"]["outcome"] = "win") => ({
      participants: [ai("model-b", "Bravo"), human(rival.userId, "Rival")],
      result: { winnerId, outcome },
    });
    // The AI win is recorded with the DEPLOYMENT id as winnerId (the real
    // shape). If profile counted winnerId === modelId this would read as a
    // loss — the bug this case pins.
    await seedMatch("ai-win", vsRival("deploy-b"));
    await seedMatch("ai-loss", vsRival(rival.userId));
    await seedMatch("ai-forfeit-loss", vsRival(rival.userId, "forfeit"));
    // another model's match — not Bravo's record
    await seedMatch("ai-other", {
      participants: [ai("model-a", "Alpha"), human(rival.userId, "Rival")],
      result: { winnerId: "model-a", outcome: "win" },
    });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.general.bestAi).toEqual({
      modelId: "model-b",
      displayName: "Bravo",
      gameKey: "nim",
      rating: 1700,
      gamesPlayed: 4,
      wins: 1,
      losses: 2,
    });
  });

  it("is an honest null when the user's models have no ratings yet", async () => {
    await seedModel("model-fresh", me.userId, "Fresh");

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.general.bestAi).toBeNull();
  });
});

describe("general elo aggregates", () => {
  it("peakElo is the max per-game peak; averageElo the rounded mean of current ratings", async () => {
    await seedRating(me.userId, { gameKey: "nim", rating: 1510, gamesPlayed: 1 });
    await seedRating(me.userId, { gameKey: "guess", rating: 1602, gamesPlayed: 3 });
    await seedMatch("m-nim", {
      rated: true,
      result: {
        winnerId: me.userId,
        outcome: "win",
        ratingChanges: [{ entityId: me.userId, delta: 30 }],
      },
    });
    await seedMatch("m-guess", {
      gameKey: "guess",
      result: { winnerId: undefined, outcome: "draw" },
    });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.general.peakElo).toBe(1602); // guess peak (its current) beats nim's 1530
    expect(summary.general.averageElo).toBe(1556); // round((1510 + 1602) / 2)
    expect(summary.general.record).toEqual({ totalMatches: 2, wins: 1, losses: 0, draws: 1 });
  });
});

describe("puzzles", () => {
  it("aggregates per-game attempts/solves/solveRate/avgTimeMs and rounds ratings", async () => {
    await setPuzzleState(me.userId, {
      puzzleRatings: { nim: { rating: 1450.4, rd: 100, vol: 0.06 } },
    });
    await seedAttempt({ puzzleId: "nim:2026-06-01", success: true, timeMs: 4000, eloDelta: 12 });
    await seedAttempt({ puzzleId: "nim:2026-06-02", success: false, timeMs: 6000, eloDelta: -10 });
    await seedAttempt({ puzzleId: "nim:2026-06-03", success: true, timeMs: 2000, eloDelta: 0 });
    // other attempters never pollute my stats
    await seedAttempt({ puzzleId: "nim:2026-06-03", attempterId: rival.userId });
    await seedAttempt({ puzzleId: "nim:2026-06-03", attempterId: "some-bot", attempterType: "ai" });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.puzzles.perGame).toHaveLength(1);
    const nim = summary.puzzles.perGame[0];
    expect(nim.gameKey).toBe("nim");
    expect(nim.rating).toBe(1450);
    expect(nim.provisional).toBe(false); // rd 100 ≤ 150
    expect(nim.attempts).toBe(3);
    expect(nim.solves).toBe(2);
    expect(nim.solveRate).toBeCloseTo(2 / 3, 5);
    expect(nim.avgTimeMs).toBe(4000);
    expect(summary.puzzles.overallRating).toBe(1450);
  });

  it("lists attempt-only games with a null provisional rating, in canonical order", async () => {
    await seedAttempt({ puzzleId: "guess:2026-06-01", success: false, timeMs: 500 });
    await seedAttempt({ puzzleId: "nim:2026-06-01", success: true, timeMs: 800 });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.puzzles.perGame.map((g) => g.gameKey)).toEqual(["nim", "guess"]);
    const guess = summary.puzzles.perGame[1];
    expect(guess.rating).toBeNull();
    expect(guess.provisional).toBe(true);
    expect(guess.attempts).toBe(1);
    expect(guess.solves).toBe(0);
    expect(guess.solveRate).toBe(0);
    expect(guess.avgTimeMs).toBe(500);
    expect(summary.puzzles.overallRating).toBeNull();
  });

  it("computes overallRating as the rounded mean across per-game puzzle ratings", async () => {
    await setPuzzleState(me.userId, {
      puzzleRatings: {
        nim: { rating: 1400, rd: 90, vol: 0.06 },
        guess: { rating: 1501, rd: 90, vol: 0.06 },
      },
    });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.puzzles.overallRating).toBe(1451); // round((1400 + 1501) / 2)
  });

  it("maps recent attempts with the rated fallback (eloDelta !== 0) and parsed puzzle ids", async () => {
    await seedAttempt({
      puzzleId: "nim:2026-06-05",
      success: true,
      rated: true, // explicit flag wins even with a 0 delta
      timeMs: 1234,
      eloDelta: 0,
      createdAt: "2026-06-05T03:00:00.000Z",
    });
    await seedAttempt({
      puzzleId: "nim:2026-06-04",
      success: false,
      timeMs: 2000,
      eloDelta: -10, // no flag: nonzero delta ⇒ rated
      createdAt: "2026-06-04T02:00:00.000Z",
    });
    await seedAttempt({
      puzzleId: "nim:2026-06-03",
      success: true,
      timeMs: 3000,
      eloDelta: 0, // no flag, no delta ⇒ practice
      createdAt: "2026-06-03T01:00:00.000Z",
    });

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.puzzles.recentAttempts).toEqual([
      {
        date: "2026-06-05",
        gameKey: "nim",
        success: true,
        rated: true,
        timeMs: 1234,
        eloDelta: 0,
        createdAt: "2026-06-05T03:00:00.000Z",
      },
      {
        date: "2026-06-04",
        gameKey: "nim",
        success: false,
        rated: true,
        timeMs: 2000,
        eloDelta: -10,
        createdAt: "2026-06-04T02:00:00.000Z",
      },
      {
        date: "2026-06-03",
        gameKey: "nim",
        success: true,
        rated: false,
        timeMs: 3000,
        eloDelta: 0,
        createdAt: "2026-06-03T01:00:00.000Z",
      },
    ]);
  });

  it("caps recent attempts at the newest 20", async () => {
    for (let day = 1; day <= 22; day += 1) {
      const ymd = `2026-05-${String(day).padStart(2, "0")}`;
      await seedAttempt({ puzzleId: `nim:${ymd}`, createdAt: `${ymd}T10:00:00.000Z` });
    }

    const summary = (await buildProfileSummary("user0"))!;

    expect(summary.puzzles.recentAttempts).toHaveLength(20);
    expect(summary.puzzles.recentAttempts[0].date).toBe("2026-05-22");
    expect(summary.puzzles.recentAttempts[19].date).toBe("2026-05-03");
  });

  it("serves the EFFECTIVE streak: zeroed after a missed day, intact when alive", async () => {
    const today = todayYmd();
    const staleDay = dayBefore(dayBefore(today));
    await setPuzzleState(me.userId, {
      puzzleStreak: { current: 5, best: 9, lastSolvedAt: staleDay },
    });
    await setPuzzleState(rival.userId, {
      puzzleStreak: { current: 4, best: 4, lastSolvedAt: today },
    });

    const stale = (await buildProfileSummary("user0"))!;
    expect(stale.puzzles.streak).toEqual({ current: 0, best: 9, lastSolvedAt: staleDay });

    const alive = (await buildProfileSummary("user1"))!;
    expect(alive.puzzles.streak).toEqual({ current: 4, best: 4, lastSolvedAt: today });
  });
});

describe("legacy user records (pre-Story-1.8, missing puzzle fields)", () => {
  it("builds the profile instead of 500ing when puzzleRatings/puzzleStreak are absent", async () => {
    // Reproduce the deployed-instance bug: a record persisted before
    // puzzleRatings/puzzleStreak existed (the backfill migration never ran),
    // so buildPuzzleStats used to throw on `undefined['tictactoe']`.
    const record = await UserRepo.get(me.userId);
    const legacy: Partial<UserRecord> = { ...record };
    delete legacy.puzzleRatings;
    delete legacy.puzzleStreak;
    await UserRepo.set(me.userId, legacy as UserRecord);

    const summary = await buildProfileSummary("user0");
    expect(summary).not.toBeNull();
    expect(summary!.puzzles.perGame).toEqual([]);
    expect(summary!.puzzles.overallRating).toBeNull();
    expect(summary!.puzzles.streak.current).toBe(0);
  });
});
