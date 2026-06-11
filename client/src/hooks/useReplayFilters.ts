import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ALL_GAME_KEYS,
  defaultReplayFilters,
  type DateRangePreset,
  type ParticipantType,
  type ReplayFilters,
  type ReplayGameKey,
  type ReplaySort,
  type ResultFilter,
} from "../util/types.ts";

const VALID_SORTS: ReplaySort[] = [
  "newest",
  "oldest",
  "most-viewed",
  "fewest-viewed",
  "longest",
  "shortest",
  "highest-elo",
  "lowest-elo",
];

const VALID_PARTICIPANT_TYPES: ParticipantType[] = ["all", "humans", "ais", "mixed"];
const VALID_DATE_PRESETS: DateRangePreset[] = ["all", "today", "week", "month", "year", "custom"];
const VALID_RESULTS: ResultFilter[] = ["wins", "losses", "draws", "abandoned", "forfeit"];

const KEY_SORT = "sort";
const KEY_GAME = "game";
const KEY_PARTICIPANT_TYPE = "participantType";
const KEY_RESULT = "result";
const KEY_MIN_ELO = "minElo";
const KEY_MAX_ELO = "maxElo";
const KEY_DATE = "date";
const KEY_DATE_FROM = "from";
const KEY_DATE_TO = "to";
const KEY_MIN_MOVES = "minMoves";
const KEY_MAX_MOVES = "maxMoves";
const KEY_PARTICIPANT = "participant";
const KEY_RATED = "rated";
const KEY_PAGE = "page";
const KEY_PRESET = "preset";

/**
 * Values an empty URL resolves to under the NEUTRAL baseline (no `defaults`
 * option passed). Pages that pass `defaults` (the discovery feed) substitute
 * their own `sort` / `date`.
 */
const paramDefaults: Record<string, string> = {
  [KEY_SORT]: "newest",
  [KEY_PARTICIPANT_TYPE]: "all",
  [KEY_MIN_ELO]: String(defaultReplayFilters.minElo),
  [KEY_MAX_ELO]: String(defaultReplayFilters.maxElo),
  [KEY_DATE]: "all",
  [KEY_MIN_MOVES]: String(defaultReplayFilters.minMoves),
  [KEY_MAX_MOVES]: String(defaultReplayFilters.maxMoves),
  [KEY_PAGE]: "1",
};

function parseNum(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parseListOf<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (valid as readonly string[]).includes(s));
}

/**
 * Reads / writes the `ReplayFilters` shape through React Router's
 * `useSearchParams`. Defaults are omitted from the URL to keep it tidy.
 *
 * `options.defaults` sets the baseline `sort` / `date` an empty URL resolves
 * to (and which are stripped back out of the URL when re-selected). The
 * discovery page passes `defaultReplayFilters`' values so its pristine state
 * is the "Popular this week" preset; callers that omit it (the profile page)
 * keep the neutral newest / all-time baseline.
 */
export default function useReplayFilters(options: {
  pageSize: number;
  forUser?: string;
  defaults?: { sort?: ReplaySort; date?: DateRangePreset };
}): {
  filters: ReplayFilters;
  setFilter: <K extends keyof ReplayFilters>(key: K, value: ReplayFilters[K]) => void;
  setFilters: (next: Partial<ReplayFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const baselineSort: ReplaySort = options.defaults?.sort ?? "newest";
  const baselineDate: DateRangePreset = options.defaults?.date ?? "all";

  const filters: ReplayFilters = useMemo(() => {
    const sort = searchParams.get(KEY_SORT);
    const gameRaw = searchParams.get(KEY_GAME);
    const ptype = searchParams.get(KEY_PARTICIPANT_TYPE);
    const resultRaw = searchParams.get(KEY_RESULT);
    const minElo = parseNum(searchParams.get(KEY_MIN_ELO), defaultReplayFilters.minElo);
    const maxElo = parseNum(searchParams.get(KEY_MAX_ELO), defaultReplayFilters.maxElo);
    const dateRaw = searchParams.get(KEY_DATE);
    const dateFrom = searchParams.get(KEY_DATE_FROM) ?? undefined;
    const dateTo = searchParams.get(KEY_DATE_TO) ?? undefined;
    const minMoves = parseNum(searchParams.get(KEY_MIN_MOVES), defaultReplayFilters.minMoves);
    const maxMoves = parseNum(searchParams.get(KEY_MAX_MOVES), defaultReplayFilters.maxMoves);
    const participantSearch = searchParams.get(KEY_PARTICIPANT) ?? "";
    const rated = searchParams.get(KEY_RATED) === "true";
    const page = parseNum(searchParams.get(KEY_PAGE), 1);
    const preset = searchParams.get(KEY_PRESET);

    return {
      sort: (VALID_SORTS as readonly string[]).includes(sort ?? "")
        ? (sort as ReplaySort)
        : baselineSort,
      games: parseListOf<ReplayGameKey>(gameRaw, ALL_GAME_KEYS),
      participantType: VALID_PARTICIPANT_TYPES.includes(ptype as ParticipantType)
        ? (ptype as ParticipantType)
        : defaultReplayFilters.participantType,
      results: parseListOf<ResultFilter>(resultRaw, VALID_RESULTS),
      minElo,
      maxElo,
      date: VALID_DATE_PRESETS.includes(dateRaw as DateRangePreset)
        ? (dateRaw as DateRangePreset)
        : baselineDate,
      dateFrom,
      dateTo,
      minMoves,
      maxMoves,
      participantSearch,
      ratedOnly: rated,
      page,
      pageSize: options.pageSize,
      preset: preset === "upsets" ? preset : undefined,
      forUser: options.forUser,
    };
  }, [searchParams, options.pageSize, options.forUser, baselineSort, baselineDate]);

  const setFilter = useCallback(
    <K extends keyof ReplayFilters>(key: K, value: ReplayFilters[K]) => {
      // Base on the LIVE URL, not the updater's `prev`: react-router's
      // functional setSearchParams hands back the params captured at the
      // last render, so two writes in quick succession (e.g. both handles
      // of a range slider) would erase each other on slower machines.
      const next = new URLSearchParams(window.location.search);
      writeFilter(next, key, value, baselineSort, baselineDate);
      // Any filter mutation other than `page` resets pagination.
      if (key !== "page") next.delete(KEY_PAGE);
      setSearchParams(next, { replace: false });
    },
    [setSearchParams, baselineSort, baselineDate],
  );

  const setFilters = useCallback(
    (changes: Partial<ReplayFilters>) => {
      // Live-URL base — see setFilter above for the stale-`prev` rationale.
      const next = new URLSearchParams(window.location.search);
      (Object.keys(changes) as (keyof ReplayFilters)[]).forEach((k) => {
        const value = changes[k];
        if (value === undefined) {
          writeFilter(next, k, undefined, baselineSort, baselineDate);
        } else {
          writeFilter(next, k, value, baselineSort, baselineDate);
        }
      });
      // Mutations other than just `page` reset pagination.
      const onlyPage = Object.keys(changes).length === 1 && Object.keys(changes)[0] === "page";
      if (!onlyPage) next.delete(KEY_PAGE);
      setSearchParams(next, { replace: false });
    },
    [setSearchParams, baselineSort, baselineDate],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return { filters, setFilter, setFilters, clearFilters };
}

function writeFilter<K extends keyof ReplayFilters>(
  params: URLSearchParams,
  key: K,
  value: ReplayFilters[K],
  baselineSort: ReplaySort,
  baselineDate: DateRangePreset,
): void {
  switch (key) {
    case "sort": {
      const v = value as ReplaySort;
      if (v === baselineSort) params.delete(KEY_SORT);
      else params.set(KEY_SORT, v);
      break;
    }
    case "games": {
      const list = (value as ReplayGameKey[]) ?? [];
      if (list.length === 0) params.delete(KEY_GAME);
      else params.set(KEY_GAME, list.join(","));
      break;
    }
    case "participantType": {
      const v = value as ParticipantType;
      if (v === "all") params.delete(KEY_PARTICIPANT_TYPE);
      else params.set(KEY_PARTICIPANT_TYPE, v);
      break;
    }
    case "results": {
      const list = (value as ResultFilter[]) ?? [];
      if (list.length === 0) params.delete(KEY_RESULT);
      else params.set(KEY_RESULT, list.join(","));
      break;
    }
    case "minElo":
      if (value === defaultReplayFilters.minElo) params.delete(KEY_MIN_ELO);
      else params.set(KEY_MIN_ELO, String(value));
      break;
    case "maxElo":
      if (value === defaultReplayFilters.maxElo) params.delete(KEY_MAX_ELO);
      else params.set(KEY_MAX_ELO, String(value));
      break;
    case "date":
      // Strip the param only when it matches the page's baseline; "all" must
      // be written explicitly when the baseline is narrower (e.g. "week").
      if (value === baselineDate) params.delete(KEY_DATE);
      else params.set(KEY_DATE, value as DateRangePreset);
      break;
    case "dateFrom":
      if (!value) params.delete(KEY_DATE_FROM);
      else params.set(KEY_DATE_FROM, value as string);
      break;
    case "dateTo":
      if (!value) params.delete(KEY_DATE_TO);
      else params.set(KEY_DATE_TO, value as string);
      break;
    case "minMoves":
      if (value === defaultReplayFilters.minMoves) params.delete(KEY_MIN_MOVES);
      else params.set(KEY_MIN_MOVES, String(value));
      break;
    case "maxMoves":
      if (value === defaultReplayFilters.maxMoves) params.delete(KEY_MAX_MOVES);
      else params.set(KEY_MAX_MOVES, String(value));
      break;
    case "participantSearch":
      if (!value) params.delete(KEY_PARTICIPANT);
      else params.set(KEY_PARTICIPANT, value as string);
      break;
    case "ratedOnly":
      if (!value) params.delete(KEY_RATED);
      else params.set(KEY_RATED, "true");
      break;
    case "page":
      if (value === 1) params.delete(KEY_PAGE);
      else params.set(KEY_PAGE, String(value));
      break;
    case "preset":
      if (!value) params.delete(KEY_PRESET);
      else params.set(KEY_PRESET, value as string);
      break;
    default:
      // Other internal fields aren't reflected in URL.
      break;
  }
}

/** Backwards-compatibility re-export. */
export const paramDefaultsForTest = paramDefaults;
