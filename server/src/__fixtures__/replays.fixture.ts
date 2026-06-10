/**
 * Seed data for the replay service so the endpoints return realistic shapes
 * in dev. Match IDs intentionally overlap with the client-side fixture
 * (`client/src/__mocks__/replays.ts`) so the FE can navigate to known URLs
 * and see real round-trips.
 *
 * Drop this file once Jasdeep's MatchRepo (#22 / #34) wires up the real
 * storage layer.
 */

import type { ReplayDetail } from "@gamenite/shared";

function isoDaysAgo(n: number): string {
  // Static reference point so dev fixtures are reproducible across restarts.
  const ref = Date.UTC(2026, 4, 20, 12, 0, 0);
  return new Date(ref - n * 24 * 60 * 60 * 1000).toISOString();
}

export const SEED_REPLAYS: ReplayDetail[] = [
  {
    matchId: "mock-match-1",
    gameId: "g-tictactoe-1",
    gameKey: "tictactoe",
    rated: true,
    completedAt: isoDaysAgo(1),
    moveCount: 7,
    watchCount: 142,
    participants: [
      {
        id: "u-yao",
        type: "human",
        displayName: "Yáo",
        username: "user0",
        ratingAtMatchTime: 1684,
      },
      {
        id: "ai-knight",
        type: "ai",
        displayName: "The Knight Of Games",
        ratingAtMatchTime: 1712,
      },
    ],
    result: {
      outcome: "win",
      winnerId: "u-yao",
      ratingChanges: [
        { entityId: "u-yao", delta: 12 },
        { entityId: "ai-knight", delta: -11 },
      ],
    },
    moves: [
      {
        index: 0,
        actor: "u-yao",
        actorDisplayName: "Yáo",
        move: { row: 1, col: 1 },
        notation: "X@center",
        timestamp: isoDaysAgo(1),
      },
      {
        index: 1,
        actor: "ai-knight",
        actorDisplayName: "The Knight Of Games",
        move: { row: 0, col: 0 },
        notation: "O@top-left",
        timestamp: isoDaysAgo(1),
      },
    ],
  },
  {
    matchId: "mock-match-2",
    gameId: "g-connect4-2",
    gameKey: "connect4",
    rated: true,
    completedAt: isoDaysAgo(3),
    moveCount: 21,
    watchCount: 58,
    participants: [
      {
        id: "ai-reddisk",
        type: "ai",
        displayName: "RedDisk_AI",
        ratingAtMatchTime: 1801,
      },
      {
        id: "ai-deepdrop",
        type: "ai",
        displayName: "DeepDrop",
        ratingAtMatchTime: 1755,
      },
    ],
    result: {
      outcome: "win",
      winnerId: "ai-reddisk",
      ratingChanges: [
        { entityId: "ai-reddisk", delta: 9 },
        { entityId: "ai-deepdrop", delta: -9 },
      ],
    },
    moves: [],
  },
  {
    matchId: "mock-match-3",
    gameId: "g-checkers-3",
    gameKey: "checkers",
    rated: true,
    completedAt: isoDaysAgo(5),
    moveCount: 44,
    watchCount: 12,
    participants: [
      {
        id: "u-rookie",
        type: "human",
        displayName: "RookieBot",
        username: "user1",
        ratingAtMatchTime: 1322,
      },
      {
        id: "u-pioneer",
        type: "human",
        displayName: "PioneerEd",
        username: "user2",
        ratingAtMatchTime: 1418,
      },
    ],
    result: {
      outcome: "draw",
      ratingChanges: [
        { entityId: "u-rookie", delta: 3 },
        { entityId: "u-pioneer", delta: -3 },
      ],
    },
    moves: [],
  },
];
