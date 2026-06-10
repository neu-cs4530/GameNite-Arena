import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ALL_GAME_KEYS,
  defaultModelFilters,
  type DateRangePreset,
  type ModelFilters,
  type ModelOwnershipFilter,
  type ModelSort,
  type ModelVisibilityFilter,
  type TrainerGameKey,
  type TrainerTier,
} from "../util/types.ts";

const VALID_SORTS: ModelSort[] = [
  "newest",
  "oldest",
  "highest-elo",
  "lowest-elo",
  "most-forked",
  "best-win-rate",
  "worst-win-rate",
  "most-matches",
  "recently-trained",
];

const VALID_VIS: ModelVisibilityFilter[] = ["all", "public", "private"];
const VALID_OWN: ModelOwnershipFilter[] = ["all", "yours", "others", "forked-from-yours"];
const VALID_DATE: DateRangePreset[] = ["all", "today", "week", "month", "year", "custom"];
const VALID_TIERS: TrainerTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];

const K = {
  sort: "sort",
  game: "game",
  vis: "visibility",
  own: "ownership",
  dep: "deployed",
  fork: "forked",
  tier: "tier",
  minElo: "minElo",
  maxElo: "maxElo",
  minWin: "minWin",
  maxWin: "maxWin",
  date: "date",
  from: "from",
  to: "to",
  owner: "modelOwner",
  chk: "checkpoint",
  page: "page",
};

function parseNum(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseList<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (valid as readonly string[]).includes(s));
}

/** URL-backed model filters hook (mirrors `useReplayFilters`). */
export default function useModelFilters(opts: { pageSize: number; viewerUsername?: string }): {
  filters: ModelFilters;
  setFilter: <K extends keyof ModelFilters>(key: K, value: ModelFilters[K]) => void;
  setFilters: (next: Partial<ModelFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: ModelFilters = useMemo(() => {
    const sort = searchParams.get(K.sort);
    const games = parseList<TrainerGameKey>(searchParams.get(K.game), ALL_GAME_KEYS);
    const vis = searchParams.get(K.vis);
    const own = searchParams.get(K.own);
    const dep = searchParams.get(K.dep) === "true";
    const forkedOnly = searchParams.get(K.fork) === "true";
    const tiers = parseList<TrainerTier>(searchParams.get(K.tier), VALID_TIERS);
    const minElo = parseNum(searchParams.get(K.minElo), defaultModelFilters.minElo);
    const maxElo = parseNum(searchParams.get(K.maxElo), defaultModelFilters.maxElo);
    const minWin = parseNum(searchParams.get(K.minWin), defaultModelFilters.minWinRate);
    const maxWin = parseNum(searchParams.get(K.maxWin), defaultModelFilters.maxWinRate);
    const date = searchParams.get(K.date);
    const dateFrom = searchParams.get(K.from) ?? undefined;
    const dateTo = searchParams.get(K.to) ?? undefined;
    const ownerSearch = searchParams.get(K.owner) ?? "";
    const hasCheckpoint = searchParams.get(K.chk) === "true";
    const page = parseNum(searchParams.get(K.page), 1);

    return {
      sort: (VALID_SORTS as readonly string[]).includes(sort ?? "")
        ? (sort as ModelSort)
        : defaultModelFilters.sort,
      games,
      visibility: VALID_VIS.includes(vis as ModelVisibilityFilter)
        ? (vis as ModelVisibilityFilter)
        : "all",
      ownership: VALID_OWN.includes(own as ModelOwnershipFilter)
        ? (own as ModelOwnershipFilter)
        : "all",
      deployedOnly: dep,
      forkedOnly,
      tiers,
      minElo,
      maxElo,
      minWinRate: minWin,
      maxWinRate: maxWin,
      date: VALID_DATE.includes(date as DateRangePreset) ? (date as DateRangePreset) : "all",
      dateFrom,
      dateTo,
      ownerSearch,
      hasCheckpoint,
      page,
      pageSize: opts.pageSize,
      viewerUsername: opts.viewerUsername,
    };
  }, [searchParams, opts.pageSize, opts.viewerUsername]);

  const setFilter = useCallback(
    <K2 extends keyof ModelFilters>(key: K2, value: ModelFilters[K2]) => {
      // Base on the live URL: react-router's functional updater hands back
      // render-time params, so rapid successive writes can erase each other.
      const next = new URLSearchParams(window.location.search);
      writeFilter(next, key, value);
      if (key !== "page") next.delete(K.page);
      setSearchParams(next, { replace: false });
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (changes: Partial<ModelFilters>) => {
      const next = new URLSearchParams(window.location.search);
      (Object.keys(changes) as (keyof ModelFilters)[]).forEach((k) => {
        writeFilter(next, k, changes[k]);
      });
      const onlyPage = Object.keys(changes).length === 1 && Object.keys(changes)[0] === "page";
      if (!onlyPage) next.delete(K.page);
      setSearchParams(next, { replace: false });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return { filters, setFilter, setFilters, clearFilters };
}

function writeFilter<KEY extends keyof ModelFilters>(
  params: URLSearchParams,
  key: KEY,
  value: ModelFilters[KEY] | undefined,
): void {
  switch (key) {
    case "sort": {
      const v = value as ModelSort;
      if (!v || v === defaultModelFilters.sort) params.delete(K.sort);
      else params.set(K.sort, v);
      break;
    }
    case "games": {
      const list = (value as TrainerGameKey[]) ?? [];
      if (list.length === 0) params.delete(K.game);
      else params.set(K.game, list.join(","));
      break;
    }
    case "visibility": {
      const v = value as ModelVisibilityFilter;
      if (!v || v === "all") params.delete(K.vis);
      else params.set(K.vis, v);
      break;
    }
    case "ownership": {
      const v = value as ModelOwnershipFilter;
      if (!v || v === "all") params.delete(K.own);
      else params.set(K.own, v);
      break;
    }
    case "deployedOnly":
      if (!value) params.delete(K.dep);
      else params.set(K.dep, "true");
      break;
    case "forkedOnly":
      if (!value) params.delete(K.fork);
      else params.set(K.fork, "true");
      break;
    case "tiers": {
      const list = (value as TrainerTier[]) ?? [];
      if (list.length === 0) params.delete(K.tier);
      else params.set(K.tier, list.join(","));
      break;
    }
    case "minElo":
      if (value === defaultModelFilters.minElo) params.delete(K.minElo);
      else params.set(K.minElo, String(value));
      break;
    case "maxElo":
      if (value === defaultModelFilters.maxElo) params.delete(K.maxElo);
      else params.set(K.maxElo, String(value));
      break;
    case "minWinRate":
      if (value === defaultModelFilters.minWinRate) params.delete(K.minWin);
      else params.set(K.minWin, String(value));
      break;
    case "maxWinRate":
      if (value === defaultModelFilters.maxWinRate) params.delete(K.maxWin);
      else params.set(K.maxWin, String(value));
      break;
    case "date": {
      const v = value as DateRangePreset;
      if (!v || v === "all") params.delete(K.date);
      else params.set(K.date, v);
      break;
    }
    case "dateFrom":
      if (!value) params.delete(K.from);
      else params.set(K.from, value as string);
      break;
    case "dateTo":
      if (!value) params.delete(K.to);
      else params.set(K.to, value as string);
      break;
    case "ownerSearch":
      if (!value) params.delete(K.owner);
      else params.set(K.owner, value as string);
      break;
    case "hasCheckpoint":
      if (!value) params.delete(K.chk);
      else params.set(K.chk, "true");
      break;
    case "page":
      if (value === 1 || !value) params.delete(K.page);
      else params.set(K.page, String(value));
      break;
    default:
      break;
  }
}
