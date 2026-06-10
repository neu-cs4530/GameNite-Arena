import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ALL_GAME_KEYS,
  defaultDeploymentFilters,
  type DeploymentFilters,
  type DeploymentSort,
  type DeploymentStatus,
  type TrainerGameKey,
} from "../util/types.ts";

const VALID_SORTS: DeploymentSort[] = [
  "newest",
  "oldest",
  "most-matches",
  "highest-elo",
  "recent-forfeits",
];
const VALID_STATUSES: DeploymentStatus[] = ["active", "paused", "retired"];

const K = {
  sort: "depSort",
  status: "depStatus",
  game: "depGame",
  forfeits: "depForfeits",
  page: "depPage",
};

function parseList<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (valid as readonly string[]).includes(s));
}

function parseNum(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

/** URL-backed deployments filter hook. */
export default function useDeploymentFilters(opts: { pageSize: number; viewerUsername?: string }): {
  filters: DeploymentFilters;
  setFilter: <K extends keyof DeploymentFilters>(key: K, value: DeploymentFilters[K]) => void;
  setFilters: (next: Partial<DeploymentFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: DeploymentFilters = useMemo(() => {
    const sort = searchParams.get(K.sort);
    const statuses = parseList<DeploymentStatus>(searchParams.get(K.status), VALID_STATUSES);
    const games = parseList<TrainerGameKey>(searchParams.get(K.game), ALL_GAME_KEYS);
    const recentForfeits = searchParams.get(K.forfeits) === "true";
    const page = parseNum(searchParams.get(K.page), 1);
    return {
      sort: (VALID_SORTS as readonly string[]).includes(sort ?? "")
        ? (sort as DeploymentSort)
        : defaultDeploymentFilters.sort,
      statuses,
      games,
      recentForfeits,
      page,
      pageSize: opts.pageSize,
      viewerUsername: opts.viewerUsername,
    };
  }, [searchParams, opts.pageSize, opts.viewerUsername]);

  const setFilter = useCallback(
    <K2 extends keyof DeploymentFilters>(key: K2, value: DeploymentFilters[K2]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          writeFilter(next, key, value);
          if (key !== "page") next.delete(K.page);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (changes: Partial<DeploymentFilters>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          (Object.keys(changes) as (keyof DeploymentFilters)[]).forEach((k) => {
            writeFilter(next, k, changes[k]);
          });
          const onlyPage = Object.keys(changes).length === 1 && Object.keys(changes)[0] === "page";
          if (!onlyPage) next.delete(K.page);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return { filters, setFilter, setFilters, clearFilters };
}

function writeFilter<KEY extends keyof DeploymentFilters>(
  params: URLSearchParams,
  key: KEY,
  value: DeploymentFilters[KEY] | undefined,
): void {
  switch (key) {
    case "sort": {
      const v = value as DeploymentSort;
      if (!v || v === defaultDeploymentFilters.sort) params.delete(K.sort);
      else params.set(K.sort, v);
      break;
    }
    case "statuses": {
      const list = (value as DeploymentStatus[]) ?? [];
      if (list.length === 0) params.delete(K.status);
      else params.set(K.status, list.join(","));
      break;
    }
    case "games": {
      const list = (value as TrainerGameKey[]) ?? [];
      if (list.length === 0) params.delete(K.game);
      else params.set(K.game, list.join(","));
      break;
    }
    case "recentForfeits":
      if (!value) params.delete(K.forfeits);
      else params.set(K.forfeits, "true");
      break;
    case "page":
      if (value === 1 || !value) params.delete(K.page);
      else params.set(K.page, String(value));
      break;
    default:
      break;
  }
}
