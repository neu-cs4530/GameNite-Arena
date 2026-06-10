import type {
  DateRangePreset,
  ParticipantType,
  ReplayFilters,
  ReplaySort,
} from "../../util/types.ts";

/**
 * Replay discovery presets.
 *
 * Each preset is a one-click bundle of *concrete* filter values: selecting a
 * pill expands client-side into `sort` / `date` / `participantType` (and, for
 * "Upsets", the mock-layer `preset` flag) before any service call is made.
 * The server never sees a preset name — only the expanded query params —
 * because the server's `preset` query param is unimplemented.
 *
 * Every preset overwrites the SAME set of controlled fields, which makes the
 * presets mutually exclusive: at most one preset can match the current
 * filters, and manually changing any controlled field deselects the pill.
 * Filters the presets do not control (game, results, Elo range, move count,
 * participant search, rated-only) compose freely with the active preset.
 */
export type ReplayPresetKey =
  | "popular-week"
  | "most-viewed-today"
  | "ai-vs-human"
  | "top-rated"
  | "upsets"
  | "newest";

/** The filter fields a preset overwrites when selected. */
export interface ReplayPresetExpansion {
  sort: ReplaySort;
  date: DateRangePreset;
  participantType: ParticipantType;
  /** Mock-layer "upsets" flag (lower-Elo participant won by a margin). */
  preset: "upsets" | undefined;
}

export interface ReplayPresetDef {
  key: ReplayPresetKey;
  label: string;
  /** Tooltip copy describing what the preset expands into. */
  description: string;
  expansion: ReplayPresetExpansion;
}

/**
 * The default discovery state. `defaultReplayFilters` in `util/types.ts`
 * carries the same `sort` + `date` values; "Clear all" returns here.
 */
export const DEFAULT_REPLAY_PRESET_KEY: ReplayPresetKey = "popular-week";

export const REPLAY_PRESETS: readonly ReplayPresetDef[] = [
  {
    key: "popular-week",
    label: "Popular this week",
    description: "Most viewed matches from the last 7 days",
    expansion: { sort: "most-viewed", date: "week", participantType: "all", preset: undefined },
  },
  {
    key: "most-viewed-today",
    label: "Most viewed today",
    description: "Most viewed matches from today",
    expansion: { sort: "most-viewed", date: "today", participantType: "all", preset: undefined },
  },
  {
    key: "ai-vs-human",
    label: "AI vs Human",
    description: "Newest matches between a human and an AI",
    expansion: { sort: "newest", date: "all", participantType: "mixed", preset: undefined },
  },
  {
    key: "top-rated",
    label: "Top rated",
    description: "Highest-Elo matches from the last 7 days",
    expansion: { sort: "highest-elo", date: "week", participantType: "all", preset: undefined },
  },
  {
    key: "upsets",
    label: "Upsets",
    description: "Matches where the lower-rated side won",
    expansion: { sort: "newest", date: "all", participantType: "all", preset: "upsets" },
  },
  {
    key: "newest",
    label: "Newest",
    description: "Every match, newest first",
    expansion: { sort: "newest", date: "all", participantType: "all", preset: undefined },
  },
];

/**
 * Derives the active preset from the current filters: a preset is active iff
 * the filters match its expansion on every controlled field. Returns
 * `undefined` for "custom" states. (Expansions are pairwise distinct, so at
 * most one preset can match.)
 */
export function matchReplayPreset(filters: ReplayFilters): ReplayPresetDef | undefined {
  return REPLAY_PRESETS.find(
    (p) =>
      filters.sort === p.expansion.sort &&
      filters.date === p.expansion.date &&
      filters.participantType === p.expansion.participantType &&
      (filters.preset ?? undefined) === p.expansion.preset,
  );
}

/**
 * The `setFilters` payload that applies a preset: the expansion plus a reset
 * of any custom date bounds (presets always use named date ranges).
 */
export function presetToFilterChanges(def: ReplayPresetDef): Partial<ReplayFilters> {
  return { ...def.expansion, dateFrom: undefined, dateTo: undefined };
}
