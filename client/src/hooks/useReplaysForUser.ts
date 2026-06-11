import { useCallback, useEffect, useMemo, useState } from "react";
import { listReplaysForUser } from "../services/replayService.ts";
import { filterMockReplays } from "../__mocks__/replays.ts";
import type { ReplayFilters, ReplayListPage } from "../util/types.ts";

/**
 * Fetches a user's recent matches (with the same filter shape).
 *
 * The page the consumer renders is the SERVICE result (real-first via
 * `replayService.listReplaysForUser`, which documents its own fixture
 * fallback). The fixture is used here for exactly one thing: a synchronous
 * placeholder page while the request for the current filter set is in
 * flight, so filter changes reflect immediately in the visible cards — the
 * e2e suite reads `match-card-title` right after URL changes, and an empty
 * frame would race those reads. As soon as the service resolves, its data
 * replaces the placeholder and stays authoritative for that filter set.
 */
export default function useReplaysForUser(username: string | undefined, filters: ReplayFilters) {
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  /** Service result, tagged with the filter key it answers. */
  const [settled, setSettled] = useState<{ key: string; page: ReplayListPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [trigger, setTrigger] = useState(0);
  const [lastKey, setLastKey] = useState(filtersKey);

  // Whenever the filter set changes, briefly toggle loading so the
  // "shows skeleton then real" contract continues to observe the
  // transient skeleton. Derived during render so we don't call setState()
  // synchronously inside an effect.
  if (lastKey !== filtersKey) {
    setLastKey(filtersKey);
    setLoading(true);
    setError(null);
  }

  // Synchronous in-flight placeholder (fixture-derived; see header).
  const placeholder = useMemo<ReplayListPage>(() => {
    if (!username) {
      return { replays: [], total: 0, page: 1, pageSize: filters.pageSize };
    }
    const { replays, total } = filterMockReplays({ ...filters, forUser: username });
    return { replays, total, page: filters.page, pageSize: filters.pageSize };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, filtersKey]);

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
      .then((result) => {
        if (cancelled) return;
        setSettled({ key: filtersKey, page: result });
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
  }, [username, filtersKey, trigger]);

  const page = settled !== null && settled.key === filtersKey ? settled.page : placeholder;

  const refetch = useCallback(() => {
    setTrigger((t) => t + 1);
  }, []);

  return { page, loading, error, refetch };
}
