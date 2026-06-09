/**
 * Deterministic mock fixture for the replay-related service layer.
 *
 * The test suite asserts specific contracts against this file:
 *  - At least 30 replays in `MOCK_REPLAYS`.
 *  - The first entry has id `"mock-match-1"` (see FIXTURE_FIRST_MATCH_ID in
 *    `client/tests/e2e/replayTestUtils.ts`).
 *  - The first entry is a Nim match with EXACTLY 8 moves.
 *  - The first entry includes user0 ("The Knight Of Games") as participant 0
 *    and an AI ("RookieBot_v1") as participant 1.
 *  - Both participants in the first match have `ratingAtMatchTime` populated.
 *  - At least one replay tagged for each featured strip.
 *  - At least 13 user0 replays so profile pagination triggers (12 per page).
 *
 * Treat this file as a contract; the test agent depends on it.
 */

import type {
  AnalysisResult,
  AnnotationView,
  MatchMoveView,
  MatchParticipantView,
  ReplayDetail,
  ReplayFilters,
  ReplayGameKey,
  ReplaySort,
  ReplaySummary,
} from "../util/types.ts";

/* ----------------------------------------------------------------------------
 * Featured-strip tags (used by service-level mock filters)
 * ------------------------------------------------------------------------- */

export type FeaturedStrip =
  | "most-viewed-today"
  | "trending-week"
  | "notable-ai-vs-human"
  | "highest-rated-week";

/** Maps matchId -> featured strips the match belongs to. */
export const mockFeatured: Record<string, FeaturedStrip[]> = {};

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const NOW = new Date("2026-05-15T18:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000).toISOString();
}

function makeHuman(
  idSuffix: string,
  displayName: string,
  username: string,
  elo: number,
): MatchParticipantView {
  return {
    id: `human:${idSuffix}`,
    type: "human",
    displayName,
    username,
    ratingAtMatchTime: elo,
  };
}

function makeAI(idSuffix: string, displayName: string, elo: number): MatchParticipantView {
  return {
    id: `ai:${idSuffix}`,
    type: "ai",
    displayName,
    ratingAtMatchTime: elo,
  };
}

/** Builds a Nim move sequence that terminates at zero in `moveCount` moves. */
function buildNimMoves(
  participants: MatchParticipantView[],
  moveCount: number,
  startPile: number,
): MatchMoveView[] {
  const moves: MatchMoveView[] = [];
  let remaining = startPile;
  let nextPlayer = 0;
  for (let i = 0; i < moveCount; i++) {
    let take: number;
    if (i === moveCount - 1) {
      // Final move takes whatever's left, capped at 3.
      take = Math.min(remaining, 3);
    } else {
      // Take 1-3, never more than remaining-1 so we still have moves left.
      take = ((i * 7 + 3) % 3) + 1;
      take = Math.min(take, Math.max(1, remaining - (moveCount - i - 1)));
    }
    const player = participants[nextPlayer];
    moves.push({
      index: i,
      actor: player.id,
      actorDisplayName: player.displayName,
      move: take,
      notation: `Take ${take}`,
      timestamp: new Date(NOW.getTime() - (moveCount - i) * 12 * 1000).toISOString(),
    });
    remaining -= take;
    nextPlayer = 1 - nextPlayer;
  }
  return moves;
}

function buildGuessMoves(participants: MatchParticipantView[], guesses: number[]): MatchMoveView[] {
  return participants.map((p, idx) => ({
    index: idx,
    actor: p.id,
    actorDisplayName: p.displayName,
    move: guesses[idx],
    notation: `Guess ${guesses[idx]}`,
    timestamp: new Date(NOW.getTime() - (participants.length - idx) * 30 * 1000).toISOString(),
  }));
}

/* ----------------------------------------------------------------------------
 * Participants (canonical entities re-used across replays)
 * ------------------------------------------------------------------------- */

const user0Const = makeHuman("user0", "The Knight Of Games", "user0", 1640);
const user1Const = makeHuman("user1", "Yáo Èr", "user1", 1480);
const user2Const = makeHuman("user2", "Sénior Dos", "user2", 1820);
const user3Const = makeHuman("user3", "Frau Drei", "user3", 2100);
const user4Const = makeHuman("user4", "Vier", "user4", 1320);
const user5Const = makeHuman("user5", "Cinq", "user5", 950);

const aiRookie = makeAI("rookie", "RookieBot_v1", 1100);
const aiRichard = makeAI("richard", "RichardBot_v2", 1750);
const aiDeepGame = makeAI("deepgame", "DeepGame_v3", 2050);
const aiGrinder = makeAI("grinder", "Grinder_v1", 1530);
const aiChampion = makeAI("champion", "Champion_AI", 2350);
const aiOblivion = makeAI("oblivion", "Oblivion_v2", 1900);

/* ----------------------------------------------------------------------------
 * Replays
 * ------------------------------------------------------------------------- */

const MOCK_REPLAYS_INTERNAL: ReplayDetail[] = [];

function pushReplay(detail: ReplayDetail, strips: FeaturedStrip[] = []): void {
  MOCK_REPLAYS_INTERNAL.push(detail);
  if (strips.length > 0) mockFeatured[detail.matchId] = strips;
}

/* --- Entry 1: contract-required Nim Human vs AI, 8 moves -------------- */
{
  const participants = [user0Const, aiRookie];
  const moves = buildNimMoves(participants, 8, 21);
  pushReplay(
    {
      matchId: "mock-match-1",
      gameId: "game-mock-1",
      gameKey: "nim",
      rated: true,
      participants,
      moves,
      moveCount: moves.length,
      watchCount: 2_345,
      result: { winnerId: user0Const.id, outcome: "win" },
      completedAt: hoursAgo(3),
    },
    ["most-viewed-today", "notable-ai-vs-human"],
  );
}

/* --- Entry 2: Guess match, Human vs Human ----------------------------- */
{
  const participants = [user0Const, user2Const];
  const moves = buildGuessMoves(participants, [42, 47]);
  pushReplay(
    {
      matchId: "mock-match-2",
      gameId: "game-mock-2",
      gameKey: "guess",
      rated: true,
      participants,
      moves,
      moveCount: moves.length,
      watchCount: 980,
      result: { winnerId: user2Const.id, outcome: "win" },
      initialState: { secret: 44, guesses: [null, null] },
      completedAt: daysAgo(1),
    },
    ["trending-week"],
  );
}

/* --- Entry 3: Nim Human vs Human, won by user0 ------------------------ */
{
  const participants = [user0Const, user1Const];
  const moves = buildNimMoves(participants, 10, 21);
  pushReplay(
    {
      matchId: "mock-match-3",
      gameId: "game-mock-3",
      gameKey: "nim",
      rated: true,
      participants,
      moves,
      moveCount: moves.length,
      watchCount: 510,
      result: { winnerId: user0Const.id, outcome: "win" },
      completedAt: daysAgo(2),
    },
    ["highest-rated-week"],
  );
}

/* --- Entry 4: AI vs AI Nim (Champion vs Richard) ---------------------- */
{
  const participants = [aiChampion, aiRichard];
  const moves = buildNimMoves(participants, 13, 30);
  pushReplay(
    {
      matchId: "mock-match-4",
      gameId: "game-mock-4",
      gameKey: "nim",
      rated: true,
      participants,
      moves,
      moveCount: moves.length,
      watchCount: 4_872,
      result: { winnerId: aiChampion.id, outcome: "win" },
      completedAt: daysAgo(3),
    },
    ["highest-rated-week", "most-viewed-today"],
  );
}

/* --- Entry 5: Guess Human vs AI, user0 vs DeepGame -------------------- */
{
  const participants = [user0Const, aiDeepGame];
  const moves = buildGuessMoves(participants, [50, 53]);
  pushReplay(
    {
      matchId: "mock-match-5",
      gameId: "game-mock-5",
      gameKey: "guess",
      rated: true,
      participants,
      moves,
      moveCount: moves.length,
      watchCount: 1_604,
      result: { winnerId: aiDeepGame.id, outcome: "win" },
      initialState: { secret: 55, guesses: [null, null] },
      completedAt: daysAgo(5),
    },
    ["notable-ai-vs-human"],
  );
}

/* --- Entry 6: Draw Nim match between user0 and user3 (rare) ---------- */
{
  const participants = [user0Const, user3Const];
  const moves = buildNimMoves(participants, 12, 24);
  pushReplay({
    matchId: "mock-match-6",
    gameId: "game-mock-6",
    gameKey: "nim",
    rated: true,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 270,
    result: { outcome: "draw" },
    completedAt: daysAgo(6),
  });
}

/* --- Entry 7: user0 loses to Grinder AI ------------------------------ */
{
  const participants = [user0Const, aiGrinder];
  const moves = buildNimMoves(participants, 6, 18);
  pushReplay({
    matchId: "mock-match-7",
    gameId: "game-mock-7",
    gameKey: "nim",
    rated: false,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 91,
    result: { winnerId: aiGrinder.id, outcome: "win" },
    completedAt: daysAgo(8),
  });
}

/* --- Entries 8-12: user0 spread of older matches ---------------------- */
{
  const variants: {
    p: [MatchParticipantView, MatchParticipantView];
    type: ReplayGameKey;
    winner: 0 | 1 | "draw";
    move: number;
    watches: number;
    day: number;
    rated: boolean;
  }[] = [
    {
      p: [user0Const, user4Const],
      type: "nim",
      winner: 0,
      move: 9,
      watches: 64,
      day: 10,
      rated: true,
    },
    {
      p: [user0Const, aiOblivion],
      type: "nim",
      winner: 1,
      move: 11,
      watches: 480,
      day: 12,
      rated: true,
    },
    {
      p: [user0Const, user5Const],
      type: "guess",
      winner: 0,
      move: 2,
      watches: 22,
      day: 14,
      rated: false,
    },
    {
      p: [user0Const, aiDeepGame],
      type: "nim",
      winner: 1,
      move: 14,
      watches: 1_211,
      day: 18,
      rated: true,
    },
    {
      p: [user0Const, user2Const],
      type: "nim",
      winner: 0,
      move: 13,
      watches: 333,
      day: 22,
      rated: true,
    },
  ];
  variants.forEach((v, i) => {
    const id = `mock-match-${8 + i}`;
    const moves =
      v.type === "nim"
        ? buildNimMoves(v.p, v.move, 22)
        : buildGuessMoves(v.p, [33 + i * 2, 37 + i * 3]);
    pushReplay({
      matchId: id,
      gameId: `game-${id}`,
      gameKey: v.type,
      rated: v.rated,
      participants: v.p,
      moves,
      moveCount: moves.length,
      watchCount: v.watches,
      result:
        v.winner === "draw" ? { outcome: "draw" } : { winnerId: v.p[v.winner].id, outcome: "win" },
      initialState: v.type === "guess" ? { secret: 35 + i, guesses: [null, null] } : undefined,
      completedAt: daysAgo(v.day),
    });
  });
}

/* --- Entries 13-15: user0 abandoned / forfeit cases ------------------ */
pushReplay({
  matchId: "mock-match-13",
  gameId: "game-mock-13",
  gameKey: "nim",
  rated: false,
  participants: [user0Const, user1Const],
  moves: buildNimMoves([user0Const, user1Const], 4, 16),
  moveCount: 4,
  watchCount: 18,
  result: { outcome: "abandoned" },
  completedAt: daysAgo(28),
});

pushReplay({
  matchId: "mock-match-14",
  gameId: "game-mock-14",
  gameKey: "guess",
  rated: false,
  participants: [user0Const, aiGrinder],
  moves: buildGuessMoves([user0Const, aiGrinder], [11, 89]),
  moveCount: 2,
  watchCount: 7,
  result: { outcome: "forfeit", winnerId: aiGrinder.id },
  initialState: { secret: 50, guesses: [null, null] },
  completedAt: daysAgo(30),
});

pushReplay({
  matchId: "mock-match-15",
  gameId: "game-mock-15",
  gameKey: "nim",
  rated: true,
  participants: [user0Const, user3Const],
  moves: buildNimMoves([user0Const, user3Const], 9, 19),
  moveCount: 9,
  watchCount: 442,
  result: { winnerId: user3Const.id, outcome: "win" },
  completedAt: daysAgo(34),
});

/* --- Entries 16-35: rest of the global discovery pool --------------- */
{
  const cohorts: {
    p: [MatchParticipantView, MatchParticipantView];
    type: ReplayGameKey;
    winner: 0 | 1 | "draw" | "abandoned";
    move: number;
    watches: number;
    day: number;
    rated: boolean;
  }[] = [
    {
      p: [user1Const, user2Const],
      type: "nim",
      winner: 1,
      move: 11,
      watches: 3_211,
      day: 1,
      rated: true,
    },
    {
      p: [user2Const, aiChampion],
      type: "nim",
      winner: 1,
      move: 15,
      watches: 4_502,
      day: 2,
      rated: true,
    },
    {
      p: [user3Const, aiDeepGame],
      type: "guess",
      winner: 0,
      move: 2,
      watches: 2_700,
      day: 1,
      rated: true,
    },
    {
      p: [aiRichard, aiOblivion],
      type: "nim",
      winner: 0,
      move: 17,
      watches: 3_980,
      day: 4,
      rated: true,
    },
    {
      p: [user4Const, user5Const],
      type: "nim",
      winner: 0,
      move: 7,
      watches: 132,
      day: 5,
      rated: true,
    },
    {
      p: [user1Const, user4Const],
      type: "guess",
      winner: 1,
      move: 2,
      watches: 88,
      day: 6,
      rated: false,
    },
    {
      p: [user3Const, user2Const],
      type: "nim",
      winner: 0,
      move: 19,
      watches: 1_900,
      day: 7,
      rated: true,
    },
    {
      p: [user5Const, aiRookie],
      type: "nim",
      winner: 1,
      move: 6,
      watches: 14,
      day: 9,
      rated: false,
    },
    {
      p: [user2Const, aiGrinder],
      type: "guess",
      winner: 0,
      move: 2,
      watches: 612,
      day: 11,
      rated: true,
    },
    {
      p: [user4Const, aiGrinder],
      type: "nim",
      winner: "draw",
      move: 12,
      watches: 50,
      day: 12,
      rated: false,
    },
    {
      p: [user3Const, aiChampion],
      type: "nim",
      winner: 0,
      move: 21,
      watches: 2_310,
      day: 13,
      rated: true,
    },
    {
      p: [user2Const, user5Const],
      type: "guess",
      winner: 1,
      move: 2,
      watches: 76,
      day: 16,
      rated: true,
    },
    {
      p: [aiDeepGame, aiChampion],
      type: "nim",
      winner: 1,
      move: 18,
      watches: 3_502,
      day: 17,
      rated: true,
    },
    {
      p: [user1Const, aiOblivion],
      type: "guess",
      winner: 0,
      move: 2,
      watches: 412,
      day: 19,
      rated: false,
    },
    {
      p: [user3Const, user4Const],
      type: "nim",
      winner: 0,
      move: 9,
      watches: 232,
      day: 21,
      rated: true,
    },
    {
      p: [user4Const, aiRichard],
      type: "nim",
      winner: 1,
      move: 13,
      watches: 188,
      day: 23,
      rated: true,
    },
    {
      p: [user1Const, user5Const],
      type: "guess",
      winner: 0,
      move: 2,
      watches: 32,
      day: 26,
      rated: false,
    },
    {
      p: [user2Const, aiDeepGame],
      type: "nim",
      winner: 1,
      move: 16,
      watches: 1_240,
      day: 38,
      rated: true,
    },
    {
      p: [user5Const, user4Const],
      type: "nim",
      winner: "abandoned",
      move: 3,
      watches: 4,
      day: 41,
      rated: false,
    },
    {
      p: [user3Const, user1Const],
      type: "nim",
      winner: 0,
      move: 14,
      watches: 690,
      day: 58,
      rated: true,
    },
  ];
  cohorts.forEach((c, i) => {
    const id = `mock-match-${16 + i}`;
    const moves =
      c.type === "nim"
        ? buildNimMoves(c.p, c.move, 24)
        : buildGuessMoves(c.p, [40 + (i % 30), 60 - (i % 25)]);
    let result;
    if (c.winner === "draw") result = { outcome: "draw" as const };
    else if (c.winner === "abandoned") result = { outcome: "abandoned" as const };
    else result = { winnerId: c.p[c.winner].id, outcome: "win" as const };
    const strips: FeaturedStrip[] = [];
    if (c.watches > 2_000 && c.day <= 1) strips.push("most-viewed-today");
    if (c.day <= 7) strips.push("trending-week");
    if (c.p[0].type !== c.p[1].type && c.watches > 1_000) strips.push("notable-ai-vs-human");
    if (
      c.rated &&
      Math.max(c.p[0].ratingAtMatchTime ?? 0, c.p[1].ratingAtMatchTime ?? 0) >= 1900 &&
      c.day <= 7
    ) {
      strips.push("highest-rated-week");
    }
    pushReplay(
      {
        matchId: id,
        gameId: `game-${id}`,
        gameKey: c.type,
        rated: c.rated,
        participants: c.p,
        moves,
        moveCount: moves.length,
        watchCount: c.watches,
        result,
        initialState:
          c.type === "guess" ? { secret: 50 - (i % 20), guesses: [null, null] } : undefined,
        completedAt: daysAgo(c.day),
      },
      strips,
    );
  });
}

/* ----------------------------------------------------------------------------
 * Public exports (slightly massaged for downstream code)
 * ------------------------------------------------------------------------- */

/** All replays, fully detailed (cloned so service mutations are isolated). */
export const MOCK_REPLAYS: ReplayDetail[] = MOCK_REPLAYS_INTERNAL;

/* --- Annotations ------------------------------------------------------ */

export const mockAnnotations: Record<string, AnnotationView[]> = {
  "mock-match-1": [
    {
      id: "ann-1-1",
      matchId: "mock-match-1",
      moveIndex: 0,
      text: "Strong opening — sets up a favorable parity from the first move.",
      marker: "good",
      // user0 owns this one so the edit/delete e2e tests (logged in as user0)
      // can mutate it without needing to wire up author switching.
      authorId: "human:user0",
      authorUsername: "user0",
      authorDisplayName: "The Knight Of Games",
      visibility: "shared",
      shareToken: "share-ann-1-1",
      createdAt: hoursAgo(20),
      reactions: { thumbsUp: 12, thumbsDown: 1 },
    },
    {
      id: "ann-1-2",
      matchId: "mock-match-1",
      moveIndex: 0,
      text: "Interesting choice — I'd usually play 2 here, but the AI was about to anyway.",
      marker: "interesting",
      authorId: "human:user3",
      authorUsername: "user3",
      authorDisplayName: "Frau Drei",
      visibility: "shared",
      shareToken: "share-ann-1-2",
      createdAt: hoursAgo(12),
      reactions: { thumbsUp: 4, thumbsDown: 0 },
    },
    {
      id: "ann-1-3",
      matchId: "mock-match-1",
      moveIndex: 0,
      // Spec contract requires at least 3 annotations on the first move spanning
      // multiple markers — move this third one onto move 0 with a different marker.
      text: "Questionable timing — could have delayed to force the AI into a worse parity.",
      marker: "questionable",
      authorId: "human:user2",
      authorUsername: "user2",
      authorDisplayName: "Sénior Dos",
      visibility: "shared",
      shareToken: "share-ann-1-3",
      createdAt: hoursAgo(8),
      reactions: { thumbsUp: 2, thumbsDown: 0 },
    },
    {
      id: "ann-1-4",
      matchId: "mock-match-1",
      moveIndex: 3,
      text: "Mistake — leaves the opponent with a winning multiple-of-4 pile.",
      marker: "bad",
      authorId: "human:user1",
      authorUsername: "user1",
      authorDisplayName: "Yáo Èr",
      visibility: "private",
      createdAt: hoursAgo(2),
      reactions: { thumbsUp: 0, thumbsDown: 0 },
    },
  ],
};

/* --- Analyses -------------------------------------------------------- */

export const mockAnalysis: Record<string, AnalysisResult> = {
  "mock-match-1": {
    matchId: "mock-match-1",
    generatedAt: NOW.toISOString(),
    perMove: [
      { moveIndex: 0, flag: "best", confidence: 0.94 },
      { moveIndex: 1, flag: "neutral", confidence: 0.8 },
      { moveIndex: 2, flag: "best", confidence: 0.91 },
      {
        moveIndex: 3,
        flag: "blunder",
        confidence: 0.82,
        notes: "Leaves a winning pile for the AI.",
      },
      { moveIndex: 4, flag: "neutral", confidence: 0.7 },
      { moveIndex: 5, flag: "inaccuracy", confidence: 0.6 },
      { moveIndex: 6, flag: "best", confidence: 0.88 },
      { moveIndex: 7, flag: "best", confidence: 0.95 },
    ],
  },
};

/* ----------------------------------------------------------------------------
 * Helper: filter / sort the fixture identically to how the eventual real
 * backend will. Used by service-layer mocks so the discovery feed behaves.
 * ------------------------------------------------------------------------- */

function toSummary(detail: ReplayDetail): ReplaySummary {
  return {
    matchId: detail.matchId,
    gameKey: detail.gameKey,
    rated: detail.rated,
    participants: detail.participants,
    result: detail.result,
    moveCount: detail.moveCount,
    watchCount: detail.watchCount,
    completedAt: detail.completedAt,
  };
}

function avgElo(p: MatchParticipantView[]): number {
  const rated = p.map((x) => x.ratingAtMatchTime).filter((r): r is number => typeof r === "number");
  if (rated.length === 0) return 0;
  return rated.reduce((s, n) => s + n, 0) / rated.length;
}

function eloRange(p: MatchParticipantView[]): [number, number] {
  const rated = p.map((x) => x.ratingAtMatchTime).filter((r): r is number => typeof r === "number");
  if (rated.length === 0) return [0, 0];
  return [Math.min(...rated), Math.max(...rated)];
}

function inDateRange(completedAt: string, filters: ReplayFilters): boolean {
  if (filters.date === "all") return true;
  if (filters.date === "custom") {
    const ts = new Date(completedAt).getTime();
    if (filters.dateFrom && ts < new Date(filters.dateFrom).getTime()) return false;
    if (filters.dateTo && ts > new Date(filters.dateTo).getTime() + 24 * 60 * 60 * 1000)
      return false;
    return true;
  }
  const days = { today: 1, week: 7, month: 30, year: 365 }[filters.date];
  const cutoff = NOW.getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(completedAt).getTime() >= cutoff;
}

function applyPreset(replay: ReplayDetail, preset: ReplayFilters["preset"]): boolean {
  if (!preset) return true;
  if (preset === "upsets") {
    if (!replay.result.winnerId) return false;
    const winner = replay.participants.find((p) => p.id === replay.result.winnerId);
    const loser = replay.participants.find((p) => p.id !== replay.result.winnerId);
    if (!winner || !loser) return false;
    return (winner.ratingAtMatchTime ?? 0) + 200 < (loser.ratingAtMatchTime ?? 0);
  }
  return true;
}

function matchesFilters(replay: ReplayDetail, filters: ReplayFilters): boolean {
  if (filters.games.length > 0 && !filters.games.includes(replay.gameKey)) return false;

  if (filters.participantType === "humans") {
    if (replay.participants.some((p) => p.type !== "human")) return false;
  } else if (filters.participantType === "ais") {
    if (replay.participants.some((p) => p.type !== "ai")) return false;
  } else if (filters.participantType === "mixed") {
    const hasHuman = replay.participants.some((p) => p.type === "human");
    const hasAI = replay.participants.some((p) => p.type === "ai");
    if (!(hasHuman && hasAI)) return false;
  }

  if (filters.results.length > 0) {
    let resultLabel: "wins" | "losses" | "draws" | "abandoned" | "forfeit";
    if (replay.result.outcome === "draw") resultLabel = "draws";
    else if (replay.result.outcome === "abandoned") resultLabel = "abandoned";
    else if (replay.result.outcome === "forfeit") resultLabel = "forfeit";
    else {
      const view = filters.forUser;
      const isViewerWinner =
        replay.participants.find((p) => p.id === replay.result.winnerId)?.username === view;
      if (!view) resultLabel = "wins";
      else resultLabel = isViewerWinner ? "wins" : "losses";
    }
    if (!filters.results.includes(resultLabel)) return false;
  }

  const [lo, hi] = eloRange(replay.participants);
  if (filters.minElo > lo) return false;
  if (filters.maxElo < hi) return false;

  if (!inDateRange(replay.completedAt, filters)) return false;

  if (replay.moveCount < filters.minMoves) return false;
  if (replay.moveCount > filters.maxMoves) return false;

  if (filters.participantSearch) {
    const term = filters.participantSearch.toLowerCase();
    if (
      !replay.participants.some(
        (p) =>
          p.displayName.toLowerCase().includes(term) ||
          (p.username ?? "").toLowerCase().includes(term),
      )
    ) {
      return false;
    }
  }

  if (filters.ratedOnly && !replay.rated) return false;

  if (filters.forUser) {
    if (!replay.participants.some((p) => p.username === filters.forUser)) return false;
  }

  if (!applyPreset(replay, filters.preset)) return false;

  return true;
}

type Comparator = (a: ReplayDetail, b: ReplayDetail) => number;
const compareNewest: Comparator = (a, b) =>
  new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
const compareOldest: Comparator = (a, b) =>
  new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
const compareMostViewed: Comparator = (a, b) => b.watchCount - a.watchCount;
const compareFewestViewed: Comparator = (a, b) => a.watchCount - b.watchCount;
const compareLongest: Comparator = (a, b) => b.moveCount - a.moveCount;
const compareShortest: Comparator = (a, b) => a.moveCount - b.moveCount;
const compareHighestElo: Comparator = (a, b) => avgElo(b.participants) - avgElo(a.participants);
const compareLowestElo: Comparator = (a, b) => avgElo(a.participants) - avgElo(b.participants);

const sortComparators: Record<ReplaySort, Comparator> = {
  newest: compareNewest,
  oldest: compareOldest,
  "most-viewed": compareMostViewed,
  "fewest-viewed": compareFewestViewed,
  longest: compareLongest,
  shortest: compareShortest,
  "highest-elo": compareHighestElo,
  "lowest-elo": compareLowestElo,
};

/** Filter and sort the entire mock fixture and return a page slice. */
export function filterMockReplays(filters: ReplayFilters): {
  replays: ReplaySummary[];
  total: number;
} {
  const matched = MOCK_REPLAYS.filter((r) => matchesFilters(r, filters));
  matched.sort(sortComparators[filters.sort]);
  const start = (filters.page - 1) * filters.pageSize;
  return {
    replays: matched.slice(start, start + filters.pageSize).map(toSummary),
    total: matched.length,
  };
}

/** Featured-strip subset query (max 6 results per strip). */
export function featuredReplays(strip: FeaturedStrip): ReplaySummary[] {
  return MOCK_REPLAYS.filter((r) => mockFeatured[r.matchId]?.includes(strip))
    .slice(0, 6)
    .map(toSummary);
}

/** Returns a deep replay detail (with moves) by matchId. */
export function findMockReplay(matchId: string): ReplayDetail | undefined {
  return MOCK_REPLAYS.find((r) => r.matchId === matchId);
}

/** Increments the local watch counter and returns the new value. */
export function incrementWatchCount(matchId: string): number {
  const replay = MOCK_REPLAYS.find((r) => r.matchId === matchId);
  if (!replay) return 0;
  replay.watchCount += 1;
  return replay.watchCount;
}
