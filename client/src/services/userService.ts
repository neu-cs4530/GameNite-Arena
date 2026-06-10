import { api } from "./api.ts";
import type { ErrorMsg, SafeUserInfo, UserAuth, UserUpdateRequest } from "@gamenite/shared";
import { listReplaysForUser } from "./replayService.ts";
import {
  ALL_GAME_KEYS,
  defaultReplayFilters,
  type ProfileDetail,
  type ProfileGameStats,
  type ReplayGameKey,
  type ReplaySummary,
} from "../util/types.ts";

const USER_API_URL = `/api/user`;

/* ---------------------------------------------------------------------------
 * Profile composition — real-first per data source.
 *
 * There is no single profile endpoint yet, so `getProfile` composes one
 * from what the server serves today:
 *
 *   1. Identity (display name, joined date): GET /api/user/:username — REAL.
 *      Falls back to the mock metadata table below on 404/network/5xx; an
 *      unknown user in BOTH sources rejects (profile page error state).
 *   2. Match history + win/loss/draw/streak stats: derived from
 *      `replayService.listReplaysForUser` (itself real-first with a
 *      documented fixture fallback), so the stat tiles always agree with
 *      the match list rendered next to them.
 *   3. Per-game ratings: GET /api/leaderboard/:gameKey lookups — REAL,
 *      best-effort (entries are matched by display name because the
 *      leaderboard keys entities by internal userId, which the client
 *      never sees). Games without a real rating fall back to the mock
 *      metadata, then to the 1200 provisional default.
 *
 * TODO(@team): replace 2+3 with a real `GET /api/user/:username/profile`
 * aggregate once the server exposes one; only this file changes.
 * ------------------------------------------------------------------------- */

/** Rating shown when neither the leaderboard nor the mock knows the user. */
const PROVISIONAL_ELO = 1200;

/** Stats derive from the most recent N matches (server caps pageSize at 100). */
const PROFILE_STATS_SAMPLE = 100;

/**
 * Mock identity/rating metadata — FALLBACK ONLY (see header). Mirrors the
 * users seeded by `server/src/initRepository.ts` plus the extra fixture
 * participants from `client/src/__mocks__/replays.ts`.
 */
const profileUsers: Record<
  string,
  {
    display: string;
    joinedAt: string;
    baseElo: number;
    perGame: Partial<Record<ReplayGameKey, number>>;
  }
> = {
  user0: {
    display: "The Knight Of Games",
    // Joined ~60 days ago (relative to mock-fixture NOW). Pulling this back
    // from "a few days ago" makes the profile header's "Joined N days ago"
    // line read like a real veteran user.
    joinedAt: "2026-04-06T18:00:00.000Z",
    baseElo: 1610,
    perGame: { nim: 1640, guess: 1580 },
  },
  user1: {
    display: "Yáo Èr",
    joinedAt: "2025-08-04T14:23:00.000Z",
    baseElo: 1480,
    perGame: { nim: 1490, guess: 1470 },
  },
  user2: {
    display: "Sénior Dos",
    joinedAt: "2025-07-21T08:50:00.000Z",
    baseElo: 1820,
    perGame: { nim: 1835, guess: 1810 },
  },
  user3: {
    display: "Frau Drei",
    joinedAt: "2025-06-08T11:30:00.000Z",
    baseElo: 2100,
    perGame: { nim: 2090, guess: 2110 },
  },
  user4: {
    display: "Vier",
    joinedAt: "2025-10-18T09:00:00.000Z",
    baseElo: 1320,
    perGame: { nim: 1320 },
  },
  user5: {
    display: "Cinq",
    joinedAt: "2025-11-02T14:45:00.000Z",
    baseElo: 950,
    perGame: { nim: 950 },
  },
};

/** Wire mirror of server `LeaderboardEntry` (leaderboard.service.ts). */
interface LeaderboardEntryWire {
  rank: number;
  entityId: string;
  entityType: "human" | "ai";
  displayName: string;
  rating: number;
  rd: number;
  gamesPlayed: number;
  provisional: boolean;
}

interface LeaderboardPageWire {
  gameKey: string;
  entries: LeaderboardEntryWire[];
}

/**
 * Best-effort real rating lookup (see header, source 3). Never throws —
 * a missing rating just means "fall back to the mock metadata".
 */
async function lookupLeaderboardRating(
  gameKey: ReplayGameKey,
  display: string,
): Promise<number | null> {
  try {
    const res = await api.get<LeaderboardPageWire>(`/api/leaderboard/${gameKey}`, {
      params: { type: "human", limit: 100 },
      // Ratings must not hold the whole profile hostage if the
      // leaderboard's Redis cache is slow/down.
      timeout: 2_500,
    });
    const entry = res.data.entries.find(
      (e) => e.entityType === "human" && e.displayName === display,
    );
    return entry ? Math.round(entry.rating) : null;
  } catch {
    return null;
  }
}

interface DerivedReplayStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  perGameRecords: Partial<Record<ReplayGameKey, { wins: number; losses: number; draws: number }>>;
}

/**
 * Derives W/L/D + streak figures from a replay page. Works identically on
 * real and fixture data — participants are matched by username either way.
 */
function deriveReplayStats(replays: ReplaySummary[], username: string): DerivedReplayStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const perGameRecords: DerivedReplayStats["perGameRecords"] = {};
  for (const r of replays) {
    const playerEntry = r.participants.find((p) => p.username === username);
    if (!playerEntry) continue;
    const record = (perGameRecords[r.gameKey] ??= { wins: 0, losses: 0, draws: 0 });
    if (r.result.outcome === "draw") {
      draws += 1;
      record.draws += 1;
    } else if (r.result.outcome === "win") {
      if (r.result.winnerId === playerEntry.id) {
        wins += 1;
        record.wins += 1;
      } else {
        losses += 1;
        record.losses += 1;
      }
    }
  }
  // Current streak: contiguous wins from the most recent match backwards.
  const newestFirst = replays
    .filter((r) => r.participants.some((p) => p.username === username))
    .slice()
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  let currentStreak = 0;
  for (const r of newestFirst) {
    const playerEntry = r.participants.find((p) => p.username === username);
    if (!playerEntry) break;
    if (r.result.outcome === "win" && r.result.winnerId === playerEntry.id) currentStreak += 1;
    else break;
  }
  return {
    totalMatches: newestFirst.length,
    wins,
    losses,
    draws,
    currentStreak,
    perGameRecords,
  };
}

/**
 * Returns the composed profile for the given username (see the composition
 * notes at the top of this file). Rejects only when the user is unknown to
 * BOTH the server and the mock table — the profile page shows its error
 * state in that case.
 */
export async function getProfile(username: string): Promise<ProfileDetail> {
  const meta = profileUsers[username];

  // 1) Identity — real-first.
  let identity: SafeUserInfo | null = null;
  try {
    identity = await getUserById(username);
  } catch {
    // 404 (user only exists in the fixture), transport failure, or an
    // `{ error }` payload — identity falls back to the mock table either
    // way; a user unknown to both sources rejects below.
    identity = null;
  }
  if (!identity && !meta) {
    throw new Error(`User not found: ${username}`);
  }
  const display = identity?.display ?? meta.display;
  // SafeUserInfo.createdAt is typed Date but arrives as an ISO string.
  const joinedAt = identity ? new Date(identity.createdAt).toISOString() : meta.joinedAt;

  // 2) Match history — through the real-first replay service.
  let replays: ReplaySummary[] = [];
  try {
    const page = await listReplaysForUser(username, {
      ...defaultReplayFilters,
      page: 1,
      pageSize: PROFILE_STATS_SAMPLE,
    });
    replays = page.replays;
  } catch {
    // Both transports failed — render a zero-match profile rather than
    // erroring the whole page; the match list section fails independently.
    replays = [];
  }
  const stats = deriveReplayStats(replays, username);

  // 3) Ratings — real leaderboard lookups, mock fallback per game.
  const gameKeys: ReplayGameKey[] = ALL_GAME_KEYS.filter(
    (g) => stats.perGameRecords[g] !== undefined || meta?.perGame[g] !== undefined,
  );
  const realRatings = await Promise.all(gameKeys.map((g) => lookupLeaderboardRating(g, display)));
  const perGame: ProfileGameStats[] = gameKeys.map((gameKey, i) => {
    const record = stats.perGameRecords[gameKey] ?? { wins: 0, losses: 0, draws: 0 };
    return {
      gameKey,
      rating: realRatings[i] ?? meta?.perGame[gameKey] ?? meta?.baseElo ?? PROVISIONAL_ELO,
      ...record,
    };
  });
  const found = realRatings.filter((r): r is number => r !== null);
  const overallElo =
    found.length > 0
      ? Math.round(found.reduce((sum, r) => sum + r, 0) / found.length)
      : (meta?.baseElo ?? PROVISIONAL_ELO);

  return {
    user: { username, display } as SafeUserInfo,
    joinedAt,
    overallElo,
    totalMatches: stats.totalMatches,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    currentStreak: stats.currentStreak,
    perGame,
    exists: true,
  };
}

/**
 * Sends a POST request to authenticate a user.
 */
export const loginUser = async (auth: UserAuth): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/login`, auth);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to update parts of a user's profile
 */
export const updateUser = async (
  auth: UserAuth,
  updates: UserUpdateRequest,
): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/${auth.username}`, {
    auth,
    payload: updates,
  });
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to create a user
 *
 * @param user - The user credentials (username and password) for login.
 * @returns The authenticated user object, or an error message.
 */
export const signupUser = async (user: UserAuth): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/signup`, user);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a GET request for a user's data
 *
 * @param username - The username
 * @returns The user's information, or an error message.
 */
export const getUserById = async (username: string): Promise<SafeUserInfo> => {
  const res = await api.get<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/${username}`);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};
