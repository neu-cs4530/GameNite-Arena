/**
 * Replay-related service functions.
 *
 * Almost every function here is MOCKED: the real backend endpoints do not
 * exist yet. The mock implementations return data from
 * `client/src/__mocks__/replays.ts` and apply the same filter / sort
 * semantics the eventual backend will, so swapping in the real
 * `api.get(...)` calls later is a one-line change per function.
 */

import type { ReplayDetail, ReplayFilters, ReplayListPage, ReplaySummary } from "../util/types.ts";
// import { api } from "./api.ts"; // re-enable when real endpoints land
import {
  featuredReplays as fetchFeatured,
  filterMockReplays,
  findMockReplay,
  incrementWatchCount,
  MOCK_REPLAYS,
  type FeaturedStrip,
} from "../__mocks__/replays.ts";

/**
 * Mock latency. Kept very small — long enough that the React render flushes
 * a skeleton frame before the success payload arrives (so the spec's
 * `expect(skeleton).toBeVisible()` lines catch it) and short enough that
 * `getByTestId("match-card").count()` returns the realised cards inside
 * the test's default 5s polling window. */
const MOCK_LATENCY_MS = 20;
function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Fetches a single replay's full detail (with moves, annotations, etc).
 *
 * TODO(@team): real endpoint pending — `GET /api/replay/:matchId`.
 */
export async function getReplay(matchId: string): Promise<ReplayDetail> {
  // const res = await api.get<ReplayDetail>(`/api/replay/${matchId}`);
  // return res.data;
  const replay = findMockReplay(matchId);
  if (!replay) {
    return Promise.reject(new Error(`Replay not found: ${matchId}`));
  }
  // Return a stable shallow clone so callers can't accidentally mutate the
  // fixture from the UI.
  return delay({ ...replay, moves: replay.moves.slice() });
}

/**
 * Global discovery feed.
 *
 * TODO(@team): real endpoint pending — `GET /api/replay/list` with query
 * params reflecting the filter set.
 */
export async function listReplays(filters: ReplayFilters): Promise<ReplayListPage> {
  // const res = await api.get<ReplayListPage>("/api/replay/list", { params: ... });
  // return res.data;
  const { replays, total } = filterMockReplays(filters);
  return delay({
    replays,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  });
}

/**
 * Replays in which `username` participated.
 *
 * TODO(@team): real endpoint pending — `GET /api/user/:username/replays`.
 */
export async function listReplaysForUser(
  username: string,
  filters: ReplayFilters,
): Promise<ReplayListPage> {
  return listReplays({ ...filters, forUser: username });
}

/**
 * Increments the match's watch counter. Returns the new value.
 *
 * TODO(@team): real endpoint pending — `POST /api/replay/:matchId/view`.
 */
export async function recordView(matchId: string): Promise<{ watchCount: number }> {
  // const res = await api.post<{ watchCount: number }>(`/api/replay/${matchId}/view`);
  // return res.data;
  const watchCount = incrementWatchCount(matchId);
  return delay({ watchCount }, 60);
}

/**
 * Builds and downloads a `.gnreplay` JSON blob for the given match.
 *
 * TODO(@team): real endpoint pending — `GET /api/replay/:matchId/download`.
 */
export async function downloadReplay(matchId: string): Promise<Blob> {
  // const res = await api.get<Blob>(`/api/replay/${matchId}/download`, {
  //   responseType: "blob",
  // });
  // return res.data;
  const replay = findMockReplay(matchId);
  if (!replay) return Promise.reject(new Error(`Replay not found: ${matchId}`));
  const json = JSON.stringify(replay, null, 2);
  return new Blob([json], { type: "application/json" });
}

/**
 * Helper used by the discovery page to fetch one of the featured strips.
 *
 * TODO(@team): real endpoint pending — `GET /api/replay/featured?strip=...`.
 */
export async function listFeaturedReplays(strip: FeaturedStrip): Promise<ReplaySummary[]> {
  return delay(fetchFeatured(strip));
}

/** Exposed for test diagnostics. */
export function replayFixtureSize(): number {
  return MOCK_REPLAYS.length;
}
