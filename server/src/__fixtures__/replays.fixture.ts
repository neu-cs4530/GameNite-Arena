/**
 * Seed data for the replay service so the endpoints return realistic shapes
 * in dev. This dataset is a 1:1 port of the client-side mock fixture
 * (`client/src/__mocks__/replays.ts`): same matchIds, gameKeys, participants,
 * results, moveCounts, watchCounts, completedAt timestamps, and move lists.
 *
 * Parity matters because the FE replay service is real-first — whenever the
 * server is up, pages render THIS list, and the FE e2e suite asserts against
 * the mock dataset's contracts (e.g. `mock-match-1` is a Nim match with
 * exactly 8 moves, user0 as participant 0, at least 13 user0 replays, ...).
 * If you change an entry here, change the client mock to match.
 *
 * The data is plain wire-shaped `ReplayDetail` — no game logic involved, so
 * checkers/connect4/tictactoe entries are fine as data. Dates are offsets
 * from process start so date-window filters ("today", "this week") always
 * have matches: the discovery page defaults to "Popular this week", and a
 * pinned reference would age out of every window and render the page empty.
 */

import type { MatchMoveView, MatchParticipantView, ReplayDetail } from "@gamenite/shared";

// Captured once at module load so the dataset is stable within a process.
const REF_MS = Date.now();

function isoDaysAgo(n: number): string {
  return new Date(REF_MS - n * 24 * 60 * 60 * 1000).toISOString();
}

function isoHoursAgo(n: number): string {
  return new Date(REF_MS - n * 60 * 60 * 1000).toISOString();
}

function isoSecondsAgo(n: number): string {
  return new Date(REF_MS - n * 1000).toISOString();
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
      timestamp: isoSecondsAgo((moveCount - i) * 12),
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
    timestamp: isoSecondsAgo((participants.length - idx) * 30),
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

export const SEED_REPLAYS: ReplayDetail[] = [];

/* --- Entry 1: contract-required Nim Human vs AI, 8 moves -------------- */
{
  const participants = [user0Const, aiRookie];
  const moves = buildNimMoves(participants, 8, 21);
  SEED_REPLAYS.push({
    matchId: "mock-match-1",
    gameId: "game-mock-1",
    gameKey: "nim",
    rated: true,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 2_345,
    result: { winnerId: user0Const.id, outcome: "win" },
    completedAt: isoHoursAgo(3),
  });
}

/* --- Entry 2: Guess match, Human vs Human ----------------------------- */
{
  const participants = [user0Const, user2Const];
  const moves = buildGuessMoves(participants, [42, 47]);
  SEED_REPLAYS.push({
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
    completedAt: isoDaysAgo(1),
  });
}

/* --- Entry 3: Nim Human vs Human, won by user0 ------------------------ */
{
  const participants = [user0Const, user1Const];
  const moves = buildNimMoves(participants, 10, 21);
  SEED_REPLAYS.push({
    matchId: "mock-match-3",
    gameId: "game-mock-3",
    gameKey: "nim",
    rated: true,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 510,
    result: { winnerId: user0Const.id, outcome: "win" },
    completedAt: isoDaysAgo(2),
  });
}

/* --- Entry 4: AI vs AI Nim (Champion vs Richard) ---------------------- */
{
  const participants = [aiChampion, aiRichard];
  const moves = buildNimMoves(participants, 13, 30);
  SEED_REPLAYS.push({
    matchId: "mock-match-4",
    gameId: "game-mock-4",
    gameKey: "nim",
    rated: true,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 4_872,
    result: { winnerId: aiChampion.id, outcome: "win" },
    completedAt: isoDaysAgo(3),
  });
}

/* --- Entry 5: Guess Human vs AI, user0 vs DeepGame -------------------- */
{
  const participants = [user0Const, aiDeepGame];
  const moves = buildGuessMoves(participants, [50, 53]);
  SEED_REPLAYS.push({
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
    completedAt: isoDaysAgo(5),
  });
}

/* --- Entry 6: Draw Nim match between user0 and user3 (rare) ---------- */
{
  const participants = [user0Const, user3Const];
  const moves = buildNimMoves(participants, 12, 24);
  SEED_REPLAYS.push({
    matchId: "mock-match-6",
    gameId: "game-mock-6",
    gameKey: "nim",
    rated: true,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 270,
    result: { outcome: "draw" },
    completedAt: isoDaysAgo(6),
  });
}

/* --- Entry 7: user0 loses to Grinder AI ------------------------------ */
{
  const participants = [user0Const, aiGrinder];
  const moves = buildNimMoves(participants, 6, 18);
  SEED_REPLAYS.push({
    matchId: "mock-match-7",
    gameId: "game-mock-7",
    gameKey: "nim",
    rated: false,
    participants,
    moves,
    moveCount: moves.length,
    watchCount: 91,
    result: { winnerId: aiGrinder.id, outcome: "win" },
    completedAt: isoDaysAgo(8),
  });
}

/* --- Entries 8-12: user0 spread of older matches ---------------------- */
{
  const variants: {
    p: [MatchParticipantView, MatchParticipantView];
    type: ReplayDetail["gameKey"];
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
    SEED_REPLAYS.push({
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
      completedAt: isoDaysAgo(v.day),
    });
  });
}

/* --- Entries 13-15: user0 abandoned / forfeit cases ------------------ */
SEED_REPLAYS.push({
  matchId: "mock-match-13",
  gameId: "game-mock-13",
  gameKey: "nim",
  rated: false,
  participants: [user0Const, user1Const],
  moves: buildNimMoves([user0Const, user1Const], 4, 16),
  moveCount: 4,
  watchCount: 18,
  result: { outcome: "abandoned" },
  completedAt: isoDaysAgo(28),
});

SEED_REPLAYS.push({
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
  completedAt: isoDaysAgo(30),
});

SEED_REPLAYS.push({
  matchId: "mock-match-15",
  gameId: "game-mock-15",
  gameKey: "nim",
  rated: true,
  participants: [user0Const, user3Const],
  moves: buildNimMoves([user0Const, user3Const], 9, 19),
  moveCount: 9,
  watchCount: 442,
  result: { winnerId: user3Const.id, outcome: "win" },
  completedAt: isoDaysAgo(34),
});

/* --- Entries 16-35: rest of the global discovery pool --------------- */
{
  const cohorts: {
    p: [MatchParticipantView, MatchParticipantView];
    type: ReplayDetail["gameKey"];
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
    let result: ReplayDetail["result"];
    if (c.winner === "draw") result = { outcome: "draw" };
    else if (c.winner === "abandoned") result = { outcome: "abandoned" };
    else result = { winnerId: c.p[c.winner].id, outcome: "win" };
    SEED_REPLAYS.push({
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
      completedAt: isoDaysAgo(c.day),
    });
  });
}
