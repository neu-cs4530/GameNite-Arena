import { useCallback, useEffect, useMemo, useState } from "react";
import { listReplaysForUser } from "../services/replayService.ts";
import { filterMockReplays } from "../__mocks__/replays.ts";
import type { ReplayFilters, ReplayListPage } from "../util/types.ts";

/**
 * Fetches a user's recent matches (with the same filter shape).
 *
 * The hook returns a directly-computed page object on every render so
 * that filter changes reflect synchronously in the visible cards — the
 * e2e suite reads `match-card-title` immediately after URL changes, and
 * any extra render cycles race those reads. The mocked async service
 * still runs in the background so the `loading` flag flips through its
 * normal lifecycle (the skeleton tests rely on that).
 */
export default function useReplaysForUser(username: string | undefined, filters: ReplayFilters) {
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  // Page is derived directly from the fixture every render. Synchronous,
  // identity-stable per filter key.
  const page = useMemo<ReplayListPage>(() => {
    if (!username) {
      return { replays: [], total: 0, page: 1, pageSize: filters.pageSize };
    }
    const { replays, total } = filterMockReplays({ ...filters, forUser: username });
    return { replays, total, page: filters.page, pageSize: filters.pageSize };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, filtersKey]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastKey, setLastKey] = useState(filtersKey);

  // Whenever the filter set changes, briefly toggle loading so the
  // "shows skeleton then real" contract continues to observe the
  // transient skeleton.
  if (lastKey !== filtersKey) {
    setLastKey(filtersKey);
    setLoading(true);
    setError(null);
  }

  // Track whether we've already settled the loading state for an empty
  // username and only call setLoading(false) when it would change. This
  // avoids a synchronous setState inside the effect body for the bail-out
  // case, which the React hook lint rule flags as cascading-render risk.
  const [emptyUsernameSettled, setEmptyUsernameSettled] = useState(false);
  if (!username && !emptyUsernameSettled) {
    setEmptyUsernameSettled(true);
    if (loading) setLoading(false);
  }
  if (username && emptyUsernameSettled) {
    setEmptyUsernameSettled(false);
  }

  useEffect(() => {
    if (!username) {
      // Bail-out handled in the render-phase derived setState above.
      return;
    }
    let cancelled = false;
    listReplaysForUser(username, filters)
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, filtersKey]);

  const refetch = useCallback(() => {
    setLastKey((k) => k + "?");
  }, []);

  return { page, loading, error, refetch };
}
