/**
 * Replay-related service functions.
 *
 * Each call hits the real REST endpoint first and falls back to the local
 * mock fixture on network failure / 404. That dual mode lets the page work
 * in three settings:
 *
 *   - prod: the server returns the canonical data, mock is never touched.
 *   - dev with the server running: the few seeded fixtures from
 *     `server/src/__fixtures__/replays.fixture.ts` come back over the wire;
 *     anything the seed doesn't cover (e.g. the rich `mock-match-N` ids the
 *     FE specs use) falls back to the client fixture.
 *   - dev without the server: everything resolves from the client fixture.
 *
 * As more match data lands in the real repo (Jasdeep's #22/#34), the seed
 * grows and the fallback path stops mattering — no consumer changes needed.
 */

import { AxiosError } from "axios";
import { api } from "./api.ts";
import type { ReplayDetail, ReplayFilters, ReplayListPage, ReplaySummary } from "../util/types.ts";
import {
  featuredReplays as fetchFeatured,
  filterMockReplays,
  findMockReplay,
  incrementWatchCount,
  MOCK_REPLAYS,
  type FeaturedStrip,
} from "../__mocks__/replays.ts";

function isNotFound(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

function isNetworkOrServerError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return true;
  if (!err.response) return true;
  return err.response.status >= 500;
}

/**
 * Translates the FE `ReplayFilters` shape into the query string the server
 * expects. Empty arrays are omitted (sending `?games=` would be parsed as
 * `[""]`); defaults are stripped to keep URLs short in dev.
 */
function filtersToQuery(
  filters: ReplayFilters,
): Record<string, string | string[] | boolean | number> {
  const q: Record<string, string | string[] | boolean | number> = {};
  if (filters.sort) q.sort = filters.sort;
  if (filters.games.length > 0) q.games = filters.games;
  if (filters.participantType !== "all") q.participantType = filters.participantType;
  if (filters.results.length > 0) q.results = filters.results;
  if (filters.minElo !== 800) q.minElo = filters.minElo;
  if (filters.maxElo !== 2400) q.maxElo = filters.maxElo;
  if (filters.date !== "all") q.date = filters.date;
  if (filters.dateFrom) q.dateFrom = filters.dateFrom;
  if (filters.dateTo) q.dateTo = filters.dateTo;
  if (filters.minMoves !== 1) q.minMoves = filters.minMoves;
  if (filters.maxMoves !== 200) q.maxMoves = filters.maxMoves;
  if (filters.participantSearch) q.participantSearch = filters.participantSearch;
  if (filters.ratedOnly) q.ratedOnly = true;
  if (filters.preset) q.preset = filters.preset;
  q.page = filters.page;
  q.pageSize = filters.pageSize;
  if (filters.forUser) q.forUser = filters.forUser;
  return q;
}

/** GET /api/replay/:matchId — falls back to the FE fixture on 404. */
export async function getReplay(matchId: string): Promise<ReplayDetail> {
  try {
    const res = await api.get<ReplayDetail>(`/api/replay/${matchId}`);
    return res.data;
  } catch (err) {
    if (isNotFound(err) || isNetworkOrServerError(err)) {
      const fallback = findMockReplay(matchId);
      if (fallback) return { ...fallback, moves: fallback.moves.slice() };
    }
    throw err instanceof Error ? err : new Error(`Replay not found: ${matchId}`);
  }
}

/** GET /api/replay/list — falls back to the FE fixture on network / 5xx. */
export async function listReplays(filters: ReplayFilters): Promise<ReplayListPage> {
  try {
    const res = await api.get<ReplayListPage>("/api/replay/list", {
      params: filtersToQuery(filters),
    });
    return res.data;
  } catch (err) {
    if (!isNetworkOrServerError(err)) throw err;
    const { replays, total } = filterMockReplays(filters);
    return { replays, total, page: filters.page, pageSize: filters.pageSize };
  }
}

/** Convenience wrapper: shares the list endpoint, scoped to one username. */
export async function listReplaysForUser(
  username: string,
  filters: ReplayFilters,
): Promise<ReplayListPage> {
  return listReplays({ ...filters, forUser: username });
}

/** POST /api/replay/:matchId/view — bumps the watch counter and returns it. */
export async function recordView(matchId: string): Promise<{ watchCount: number }> {
  try {
    const res = await api.post<{ matchId: string; watchCount: number }>(
      `/api/replay/${matchId}/view`,
    );
    return { watchCount: res.data.watchCount };
  } catch (err) {
    if (isNotFound(err) || isNetworkOrServerError(err)) {
      return { watchCount: incrementWatchCount(matchId) };
    }
    throw err;
  }
}

/**
 * Builds and downloads a `.gnreplay` JSON blob for the given match.
 * The dedicated download endpoint (#34) hasn't shipped yet — for now we
 * fetch the detail payload through `getReplay` and serialize client-side.
 */
export async function downloadReplay(matchId: string): Promise<Blob> {
  const replay = await getReplay(matchId);
  const json = JSON.stringify(replay, null, 2);
  return new Blob([json], { type: "application/json" });
}

/**
 * Featured strips ("most viewed today", "notable AI vs human") are derived
 * client-side from the discovery list until a dedicated endpoint exists.
 */
export function listFeaturedReplays(strip: FeaturedStrip): Promise<ReplaySummary[]> {
  return Promise.resolve(fetchFeatured(strip));
}

/** Exposed for test diagnostics. */
export function replayFixtureSize(): number {
  return MOCK_REPLAYS.length;
}
