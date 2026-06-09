/**
 * Replay service — read APIs for the replay viewer / discovery surfaces.
 *
 * Today this is backed by an in-memory `Map` seeded with a small fixture so
 * the endpoints return something useful in dev. The interface (`ReplayStore`)
 * is intentionally minimal so a Keyv/Mongo-backed implementation can replace
 * the in-memory one once Jasdeep's MatchRepo is wired (see issues #22/#34).
 */

import type {
  ReplayDetail,
  ReplayListPage,
  ReplayListQuery,
  ReplaySummary,
  ReplayWatchCountResponse,
} from "@gamenite/shared";

import { SEED_REPLAYS } from "../__fixtures__/replays.fixture.ts";

export interface ReplayStore {
  getById(matchId: string): Promise<ReplayDetail | undefined>;
  listAll(): Promise<ReplayDetail[]>;
  setWatchCount(matchId: string, count: number): Promise<void>;
}

class InMemoryReplayStore implements ReplayStore {
  private readonly _byId = new Map<string, ReplayDetail>();

  constructor(seed: ReplayDetail[]) {
    for (const r of seed) this._byId.set(r.matchId, { ...r });
  }

  getById(matchId: string): Promise<ReplayDetail | undefined> {
    const found = this._byId.get(matchId);
    return Promise.resolve(found ? { ...found } : undefined);
  }

  listAll(): Promise<ReplayDetail[]> {
    return Promise.resolve(Array.from(this._byId.values(), (r) => ({ ...r })));
  }

  setWatchCount(matchId: string, count: number): Promise<void> {
    const found = this._byId.get(matchId);
    if (found) found.watchCount = count;
    return Promise.resolve();
  }
}

// Module-level store keeps the watch counts persistent across requests within
// a process. Replace with a real repo once available.
let store: ReplayStore = new InMemoryReplayStore(SEED_REPLAYS);

/** Exposed for tests so each spec can start from a clean fixture. */
export function replaceStoreForTests(next: ReplayStore): void {
  store = next;
}

/** Returns a single replay by id, or `null` when nothing matches. */
export async function getReplay(matchId: string): Promise<ReplayDetail | null> {
  const found = await store.getById(matchId);
  return found ?? null;
}

/** Increments the watch count for a replay and returns the new value. */
export async function recordWatch(matchId: string): Promise<ReplayWatchCountResponse | null> {
  const found = await store.getById(matchId);
  if (!found) return null;
  const nextCount = found.watchCount + 1;
  await store.setWatchCount(matchId, nextCount);
  return { matchId, watchCount: nextCount };
}

/**
 * Lists replays matching the given filters. Filtering and pagination happen
 * in memory — fine at fixture scale, will need a query-pushdown rewrite when
 * the real repo lands and the dataset grows.
 */
export async function listReplays(query: ReplayListQuery): Promise<ReplayListPage> {
  const all = await store.listAll();
  const summaries = all.map(toSummary);
  const filtered = applyFilters(summaries, query);
  const sorted = applySort(filtered, query.sort ?? "newest");

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 24));
  const start = (page - 1) * pageSize;
  const slice = sorted.slice(start, start + pageSize);

  return {
    replays: slice,
    total: sorted.length,
    page,
    pageSize,
  };
}

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

function applyFilters(items: ReplaySummary[], q: ReplayListQuery): ReplaySummary[] {
  return items.filter((r) => {
    if (q.games && q.games.length > 0 && !q.games.includes(r.gameKey)) return false;
    if (q.ratedOnly && !r.rated) return false;
    if (q.minMoves !== undefined && r.moveCount < q.minMoves) return false;
    if (q.maxMoves !== undefined && r.moveCount > q.maxMoves) return false;

    if (q.participantType && q.participantType !== "all") {
      const types = new Set(r.participants.map((p) => p.type));
      if (q.participantType === "humans" && (types.has("ai") || !types.has("human"))) return false;
      if (q.participantType === "ais" && (types.has("human") || !types.has("ai"))) return false;
      if (q.participantType === "mixed" && !(types.has("ai") && types.has("human"))) return false;
    }

    if (q.results && q.results.length > 0) {
      const allow = new Set(q.results);
      const isWin = r.result.outcome === "win";
      const ok =
        (allow.has("wins") && isWin) ||
        (allow.has("draws") && r.result.outcome === "draw") ||
        (allow.has("abandoned") && r.result.outcome === "abandoned") ||
        (allow.has("forfeit") && r.result.outcome === "forfeit") ||
        // "losses" only meaningful when forUser is set — handled below
        false;
      if (!ok && !(allow.has("losses") && q.forUser)) return false;
    }

    if (q.minElo !== undefined || q.maxElo !== undefined) {
      const ratings = r.participants
        .map((p) => p.ratingAtMatchTime)
        .filter((x): x is number => typeof x === "number");
      if (ratings.length > 0) {
        const avg = ratings.reduce((s, n) => s + n, 0) / ratings.length;
        if (q.minElo !== undefined && avg < q.minElo) return false;
        if (q.maxElo !== undefined && avg > q.maxElo) return false;
      }
    }

    if (q.dateFrom && r.completedAt < q.dateFrom) return false;
    if (q.dateTo && r.completedAt > q.dateTo) return false;

    if (q.participantSearch) {
      const needle = q.participantSearch.toLowerCase();
      const hit = r.participants.some(
        (p) =>
          p.displayName.toLowerCase().includes(needle) ||
          (p.username ?? "").toLowerCase().includes(needle),
      );
      if (!hit) return false;
    }

    if (q.forUser) {
      const match = r.participants.find((p) => p.username === q.forUser);
      if (!match) return false;
    }

    return true;
  });
}

function applySort(
  items: ReplaySummary[],
  sort: NonNullable<ReplayListQuery["sort"]>,
): ReplaySummary[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    case "oldest":
      return copy.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    case "most-viewed":
      return copy.sort((a, b) => b.watchCount - a.watchCount);
    case "fewest-viewed":
      return copy.sort((a, b) => a.watchCount - b.watchCount);
    case "longest":
      return copy.sort((a, b) => b.moveCount - a.moveCount);
    case "shortest":
      return copy.sort((a, b) => a.moveCount - b.moveCount);
    case "highest-elo":
      return copy.sort((a, b) => avgRating(b) - avgRating(a));
    case "lowest-elo":
      return copy.sort((a, b) => avgRating(a) - avgRating(b));
  }
}

function avgRating(r: ReplaySummary): number {
  const xs = r.participants.map((p) => p.ratingAtMatchTime ?? 0);
  return xs.length === 0 ? 0 : xs.reduce((s, n) => s + n, 0) / xs.length;
}
