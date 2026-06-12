import { ALL_GAME_KEYS, type ReplayGameKey } from "../../util/types.ts";
import { replayGameNames } from "../../util/consts.ts";

/**
 * The pill scopes on the profile Overview tab. Everything on the tab renders
 * from exactly one of these slices of the ProfileSummary:
 * `general` | one per ReplayGameKey | `puzzles`, deep-linked via `?scope=`.
 */
export type ProfileScope = "general" | ReplayGameKey | "puzzles";

export const PROFILE_SCOPES: readonly ProfileScope[] = ["general", ...ALL_GAME_KEYS, "puzzles"];

/** URL search param carrying the selected scope (`general` is omitted). */
export const SCOPE_PARAM = "scope";

/** Parses `?scope=` — anything unknown falls back to the General scope. */
export function parseProfileScope(raw: string | null): ProfileScope {
  return PROFILE_SCOPES.includes(raw as ProfileScope) ? (raw as ProfileScope) : "general";
}

/** True when the scope is one specific game (not general / puzzles). */
export function isGameScope(scope: ProfileScope): scope is ReplayGameKey {
  return scope !== "general" && scope !== "puzzles";
}

/** Display label for one scope pill. */
export function scopeLabel(scope: ProfileScope): string {
  if (scope === "general") return "General";
  if (scope === "puzzles") return "Puzzles";
  return replayGameNames[scope];
}
