import type { HeatmapGrid, ProfileSummary } from "@gamenite/shared";

/**
 * THE one shared mock ProfileSummary for client unit tests (see
 * docs/profile-puzzles-rework.md §Testing). Every profile/puzzle-stat unit
 * test imports from here — do not create rival profile fixtures.
 *
 * The numbers are deliberately DISTINCT per scope (general vs nim vs guess)
 * so scope-switching tests can tell exactly which slice of the summary a
 * component rendered.
 */

/** Builds a 7x24 zero grid with the given (day, hour, count) cells set. */
function grid(entries: ReadonlyArray<readonly [number, number, number]>): HeatmapGrid {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const [day, hour, count] of entries) cells[day][hour] = count;
  return cells;
}

export const profileSummaryFixture: ProfileSummary = {
  user: {
    username: "user0",
    display: "The Knight Of Games",
    createdAt: new Date("2026-04-06T18:00:00.000Z"),
  },
  general: {
    record: { totalMatches: 42, wins: 24, losses: 14, draws: 4 },
    peakElo: 1725,
    averageElo: 1610,
    // Sunday 00:00 differs from the nim grid (5 vs 3) on purpose; Saturday
    // 23:00 exercises the singular "1 match" aria-label.
    heatmap: grid([
      [0, 0, 5],
      [2, 14, 2],
      [6, 23, 1],
    ]),
    bestAi: {
      modelId: "model-7",
      displayName: "Nimbus Prime",
      gameKey: "nim",
      rating: 1493,
      gamesPlayed: 38,
      wins: 22,
      losses: 16,
    },
    mostViewed: {
      matchId: "m-gen-1",
      gameKey: "guess",
      rated: true,
      participants: [
        { id: "u0", type: "human", displayName: "The Knight Of Games", username: "user0" },
        { id: "u2", type: "human", displayName: "Sénior Dos", username: "user2" },
      ],
      result: { winnerId: "u0", outcome: "win" },
      moveCount: 9,
      watchCount: 87,
      completedAt: "2026-06-01T19:30:00.000Z",
    },
  },
  perGame: [
    {
      gameKey: "nim",
      rating: { current: 1640, peak: 1725, average: 1602, gamesPlayed: 30, provisional: false },
      record: { totalMatches: 30, wins: 18, losses: 10, draws: 2 },
      heatmap: grid([
        [0, 0, 3],
        [3, 9, 4],
      ]),
      mostViewed: {
        matchId: "m-nim-1",
        gameKey: "nim",
        rated: true,
        participants: [
          { id: "u0", type: "human", displayName: "The Knight Of Games", username: "user0" },
          { id: "ai-1", type: "ai", displayName: "Pile Driver" },
        ],
        result: { winnerId: "ai-1", outcome: "win" },
        moveCount: 14,
        watchCount: 41,
        completedAt: "2026-05-20T08:05:00.000Z",
      },
    },
    {
      gameKey: "guess",
      rating: { current: 1580, peak: 1660, average: 1544, gamesPlayed: 12, provisional: false },
      record: { totalMatches: 12, wins: 6, losses: 4, draws: 2 },
      heatmap: grid([[1, 13, 2]]),
      mostViewed: {
        matchId: "m-guess-1",
        gameKey: "guess",
        rated: false,
        participants: [
          { id: "u0", type: "human", displayName: "The Knight Of Games", username: "user0" },
          { id: "u1", type: "human", displayName: "Yáo Èr", username: "user1" },
        ],
        result: { winnerId: "u1", outcome: "win" },
        moveCount: 7,
        watchCount: 19,
        completedAt: "2026-05-28T22:10:00.000Z",
      },
    },
  ],
  puzzles: {
    overallRating: 1512,
    perGame: [
      {
        gameKey: "nim",
        rating: 1512,
        provisional: false,
        attempts: 14,
        solves: 10,
        solveRate: 10 / 14,
        avgTimeMs: 41_000,
      },
    ],
    streak: { current: 4, best: 9, lastSolvedAt: "2026-06-11" },
    recentAttempts: [
      {
        date: "2026-06-11",
        gameKey: "nim",
        success: true,
        rated: true,
        timeMs: 38_000,
        eloDelta: 12,
        createdAt: "2026-06-11T14:02:11.000Z",
      },
      {
        date: "2026-06-10",
        gameKey: "nim",
        success: false,
        rated: true,
        timeMs: 61_000,
        eloDelta: -8,
        createdAt: "2026-06-10T09:41:00.000Z",
      },
      {
        date: "2026-06-09",
        gameKey: "nim",
        success: true,
        rated: false,
        timeMs: 45_000,
        eloDelta: 0,
        createdAt: "2026-06-09T20:15:30.000Z",
      },
    ],
  },
};

/**
 * The same user shape for a brand-new account: zero matches, no ratings, no
 * AI, no puzzle history. Header/empty-state tests render the honest
 * "Unrated"/empty paths from this. Derived here (not in test files) so the
 * whole suite still has exactly one profile fixture.
 */
export const freshProfileSummaryFixture: ProfileSummary = {
  user: {
    username: "user5",
    display: "Cinq",
    createdAt: new Date("2026-06-01T14:45:00.000Z"),
  },
  general: {
    record: { totalMatches: 0, wins: 0, losses: 0, draws: 0 },
    peakElo: null,
    averageElo: null,
    heatmap: grid([]),
    bestAi: null,
    mostViewed: null,
  },
  perGame: [],
  puzzles: {
    overallRating: null,
    perGame: [],
    streak: { current: 0, best: 0 },
    recentAttempts: [],
  },
};
