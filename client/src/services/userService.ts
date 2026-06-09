import { api } from "./api.ts";
import type { ErrorMsg, SafeUserInfo, UserAuth, UserUpdateRequest } from "@gamenite/shared";
import { MOCK_REPLAYS } from "../__mocks__/replays.ts";
import type { ProfileDetail, ProfileGameStats, ReplayGameKey } from "../util/types.ts";

const USER_API_URL = `/api/user`;

/* ---------------------------------------------------------------------------
 * Mock profile lookup
 *
 * TODO(@team): real endpoint pending — `GET /api/user/:username/profile`.
 * Until then we synthesise a ProfileDetail from the mock replay fixture so
 * the redesigned `/profile/:username` page has stats / Elos to render.
 * ------------------------------------------------------------------------- */

const PROFILE_MOCK_LATENCY_MS = 15;

function delay<T>(value: T, ms = PROFILE_MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

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

/**
 * Returns a mocked profile detail for the given username. Throws if the
 * username is unknown — the profile page shows an "error state" in that
 * case.
 */
export async function getProfile(username: string): Promise<ProfileDetail> {
  const meta = profileUsers[username];
  if (!meta) {
    return Promise.reject(new Error(`User not found: ${username}`));
  }
  // Walk the mock replays for this user to derive wins/losses/draws.
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalMatches = 0;
  const matchedIds: string[] = [];
  for (const r of MOCK_REPLAYS) {
    const playerEntry = r.participants.find((p) => p.username === username);
    if (!playerEntry) continue;
    totalMatches += 1;
    matchedIds.push(r.matchId);
    if (r.result.outcome === "draw") draws += 1;
    else if (r.result.outcome === "win") {
      if (r.result.winnerId === playerEntry.id) wins += 1;
      else losses += 1;
    }
  }
  // Compute current streak (most recent contiguous win count from newest).
  const recentRelevant = MOCK_REPLAYS.filter((r) =>
    r.participants.some((p) => p.username === username),
  ).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  let currentStreak = 0;
  for (const r of recentRelevant) {
    const playerEntry = r.participants.find((p) => p.username === username);
    if (!playerEntry) break;
    if (r.result.outcome === "win" && r.result.winnerId === playerEntry.id) currentStreak += 1;
    else break;
  }
  const perGame: ProfileGameStats[] = (Object.keys(meta.perGame) as ReplayGameKey[]).map(
    (gameKey) => {
      const rating = meta.perGame[gameKey] ?? meta.baseElo;
      let gWins = 0;
      let gLosses = 0;
      let gDraws = 0;
      for (const r of MOCK_REPLAYS) {
        if (r.gameKey !== gameKey) continue;
        const playerEntry = r.participants.find((p) => p.username === username);
        if (!playerEntry) continue;
        if (r.result.outcome === "draw") gDraws += 1;
        else if (r.result.outcome === "win") {
          if (r.result.winnerId === playerEntry.id) gWins += 1;
          else gLosses += 1;
        }
      }
      return { gameKey, rating, wins: gWins, losses: gLosses, draws: gDraws };
    },
  );
  return delay({
    user: { username, display: meta.display } as SafeUserInfo,
    joinedAt: meta.joinedAt,
    overallElo: meta.baseElo,
    totalMatches,
    wins,
    losses,
    draws,
    currentStreak,
    perGame,
    exists: true,
  });
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
