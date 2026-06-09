import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ALL_GAME_KEYS,
  defaultJobFilters,
  type DateRangePreset,
  type JobFilters,
  type JobSort,
  type JobStatus,
  type TrainerGameKey,
} from "../util/types.ts";

const VALID_SORTS: JobSort[] = [
  "newest",
  "oldest",
  "longest-running",
  "shortest-completed",
  "highest-reward",
  "lowest-reward",
];
const VALID_STATUSES: JobStatus[] = ["queued", "running", "completed", "failed", "canceled"];
const VALID_DATE: DateRangePreset[] = ["all", "today", "week", "month", "year", "custom"];

const K = {
  sort: "jobSort",
  status: "status",
  game: "jobGame",
  chk: "jobCheckpoint",
  date: "jobDate",
  from: "jobFrom",
  to: "jobTo",
  page: "jobPage",
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

/** URL-backed jobs filter hook. */
export default function useJobFilters(opts: { pageSize: number; viewerUsername?: string }): {
  filters: JobFilters;
  setFilter: <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => void;
  setFilters: (next: Partial<JobFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: JobFilters = useMemo(() => {
    const sort = searchParams.get(K.sort);
    const statuses = parseList<JobStatus>(searchParams.get(K.status), VALID_STATUSES);
    const games = parseList<TrainerGameKey>(searchParams.get(K.game), ALL_GAME_KEYS);
    const hasCheckpoint = searchParams.get(K.chk) === "true";
    const date = searchParams.get(K.date);
    const dateFrom = searchParams.get(K.from) ?? undefined;
    const dateTo = searchParams.get(K.to) ?? undefined;
    const page = parseNum(searchParams.get(K.page), 1);
    return {
      sort: (VALID_SORTS as readonly string[]).includes(sort ?? "")
        ? (sort as JobSort)
        : defaultJobFilters.sort,
      statuses,
      games,
      hasCheckpoint,
      date: VALID_DATE.includes(date as DateRangePreset) ? (date as DateRangePreset) : "all",
      dateFrom,
      dateTo,
      page,
      pageSize: opts.pageSize,
      viewerUsername: opts.viewerUsername,
    };
  }, [searchParams, opts.pageSize, opts.viewerUsername]);

  const setFilter = useCallback(
    <K2 extends keyof JobFilters>(key: K2, value: JobFilters[K2]) => {
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
    (changes: Partial<JobFilters>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          (Object.keys(changes) as (keyof JobFilters)[]).forEach((k) => {
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

function writeFilter<KEY extends keyof JobFilters>(
  params: URLSearchParams,
  key: KEY,
  value: JobFilters[KEY] | undefined,
): void {
  switch (key) {
    case "sort": {
      const v = value as JobSort;
      if (!v || v === defaultJobFilters.sort) params.delete(K.sort);
      else params.set(K.sort, v);
      break;
    }
    case "statuses": {
      const list = (value as JobStatus[]) ?? [];
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
    case "hasCheckpoint":
      if (!value) params.delete(K.chk);
      else params.set(K.chk, "true");
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
    case "page":
      if (value === 1 || !value) params.delete(K.page);
      else params.set(K.page, String(value));
      break;
    default:
      break;
  }
}
