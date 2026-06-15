/**
 * Replay service — read APIs for the replay viewer / discovery surfaces.
 *
 * Reads come from two layered stores:
 *   1. `KeyvMatchReplayStore` — real finished games, written by the
 *      MatchRecorder at game end into the Keyv `MatchRepo` (in-memory by
 *      default, MongoDB when MONGO_STR is configured).
 *   2. `InMemoryReplayStore` seeded with the dev fixture — keeps the
 *      discovery page populated before anyone has played a real game.
 *
 * The composite checks real matches first, so a captured game with the same
 * id always wins over a fixture entry.
 */

import type {
  GameKey,
  ReplayDetail,
  ReplayGameKey,
  ReplayListPage,
  ReplayListQuery,
  ReplaySummary,
  ReplayWatchCountResponse,
} from "@gamenite/shared";

import { SEED_REPLAYS } from "../__fixtures__/replays.fixture.ts";
import type { MatchRecord } from "../models.ts";
import { MatchRepo as matchRepoStore, UserRepo, WatchCountRepo } from "../repository.ts";

export interface ReplayStore {
  getById(matchId: string): Promise<ReplayDetail | undefined>;
  listAll(): Promise<ReplayDetail[]>;
  setWatchCount(matchId: string, count: number): Promise<void>;
}

export class InMemoryReplayStore implements ReplayStore {
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

/** Server GameKey → wire ReplayGameKey (identity today; map point if they diverge). */
const wireGameKey: Record<GameKey, ReplayGameKey> = {
  nim: "nim",
  guess: "guess",
  tictactoe: "tictactoe",
  connect4: "connect4",
  checkers: "checkers",
};

/**
 * Human-readable move summary for the move list and notation export. The
 * live games store bare numeric payloads, so notate per game key; anything
 * unrecognized falls back to compact JSON.
 */
function notateMove(gameKey: GameKey, move: unknown): string {
  if (typeof move === "number") {
    return gameKey === "nim" ? `Take ${move}` : `Guess ${move}`;
  }
  return JSON.stringify(move);
}

/**
 * Projects an archival {@link MatchRecord} into the wire `ReplayDetail`.
 * Human usernames are resolved via UserRepo so the FE can link profiles;
 * `ratingAtMatchTime` is omitted (ratings snapshots aren't recorded yet).
 */
async function matchToReplayDetail(
  matchId: string,
  record: MatchRecord,
  watchCount: number,
): Promise<ReplayDetail> {
  const participants = await Promise.all(
    record.participants.map(async (p) => ({
      id: p.id,
      type: p.type,
      displayName: p.displayName,
      username: p.type === "human" ? (await UserRepo.find(p.id))?.username : undefined,
    })),
  );
  const nameById = new Map(participants.map((p) => [p.id, p.displayName]));
  return {
    matchId,
    gameId: record.gameId,
    gameKey: wireGameKey[record.gameKey],
    rated: record.rated,
    participants,
    result: record.result,
    moveCount: record.moves.length,
    watchCount,
    completedAt: record.completedAt,
    initialState: record.initialState,
    moves: record.moves.map((m, index) => ({
      index,
      actor: m.actor,
      actorDisplayName: nameById.get(m.actor) ?? m.actor,
      move: m.move,
      notation: notateMove(record.gameKey, m.move),
      timestamp: m.timestamp,
    })),
  };
}

/**
 * Read-side adapter over the Keyv `MatchRepo` the recorder writes into.
 * Watch counts live in their own Keyv repo (`WatchCountRepo`, keyed by
 * matchId) so they survive across requests and — with MongoDB configured —
 * process restarts, while the archival MatchRecord itself stays immutable.
 */
export class KeyvMatchReplayStore implements ReplayStore {
  async getById(matchId: string): Promise<ReplayDetail | undefined> {
    const record = await matchRepoStore.find(matchId);
    if (!record) return undefined;
    return matchToReplayDetail(matchId, record, (await WatchCountRepo.find(matchId)) ?? 0);
  }

  async listAll(): Promise<ReplayDetail[]> {
    const keys = await matchRepoStore.getAllKeys();
    const records = await matchRepoStore.getMany(keys);
    return Promise.all(
      records.map(async (record, i) =>
        matchToReplayDetail(keys[i], record, (await WatchCountRepo.find(keys[i])) ?? 0),
      ),
    );
  }

  async setWatchCount(matchId: string, count: number): Promise<void> {
    await WatchCountRepo.set(matchId, count);
  }
}

/** Layers stores; earlier stores shadow later ones for the same matchId. */
export class CompositeReplayStore implements ReplayStore {
  private readonly _stores: ReplayStore[];

  constructor(stores: ReplayStore[]) {
    this._stores = stores;
  }

  async getById(matchId: string): Promise<ReplayDetail | undefined> {
    for (const s of this._stores) {
      const found = await s.getById(matchId);
      if (found) return found;
    }
    return undefined;
  }

  async listAll(): Promise<ReplayDetail[]> {
    const seen = new Set<string>();
    const all: ReplayDetail[] = [];
    for (const s of this._stores) {
      for (const r of await s.listAll()) {
        if (!seen.has(r.matchId)) {
          seen.add(r.matchId);
          all.push(r);
        }
      }
    }
    return all;
  }

  async setWatchCount(matchId: string, count: number): Promise<void> {
    for (const s of this._stores) {
      if (await s.getById(matchId)) {
        await s.setWatchCount(matchId, count);
        return;
      }
    }
  }
}

/**
 * Builds the store stack. Production serves REAL matches only — the dev seed
 * (SEED_REPLAYS) is never composed in when MODE=production, so prod never
 * surfaces the `mock-match-*` fixtures. Dev and tests (MODE unset) still get
 * the seed for local browsing and the in-memory fixtures the specs rely on.
 */
export function makeDefaultStore(): ReplayStore {
  const stores: ReplayStore[] = [new KeyvMatchReplayStore()];
  if (process.env.MODE !== "production") {
    stores.push(new InMemoryReplayStore(SEED_REPLAYS));
  }
  return new CompositeReplayStore(stores);
}

// Module-level store singleton. Real-match watch counts persist in
// WatchCountRepo (so re-instantiating the stack loses nothing); the seed
// store keeps fixture counts for the lifetime of the instance.
let store: ReplayStore = makeDefaultStore();

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

    // Rolling-window date presets (mirrors the client mock's semantics:
    // today=24h, week=7d, month=30d, year=365d). "custom" relies on the
    // explicit dateFrom/dateTo bounds below.
    if (q.date && q.date !== "all" && q.date !== "custom") {
      const days = { today: 1, week: 7, month: 30, year: 365 }[q.date];
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      if (r.completedAt < cutoff) return false;
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
