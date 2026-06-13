/**
 * Bridges the new-run form to the shared per-game training-heuristics
 * catalog (shared/src/trainingHeuristics.ts). The dropdowns render from
 * `trainingHeuristicFields`; the chosen values ride in
 * `config.extra[HEURISTICS_EXTRA_KEY]`; and the power-user JSON textarea
 * keeps its own keys — on collision the dropdowns win, because they are
 * the validated surface.
 */

import {
  HEURISTICS_EXTRA_KEY,
  parseHeuristics,
  trainingHeuristicFields,
  type HeuristicField,
  type HeuristicGameKey,
} from "@gamenite/shared";

/** The shared field list for a game, or null when it has no tunables. */
export function heuristicFieldsFor(gameKey: string): HeuristicField[] | null {
  return trainingHeuristicFields[gameKey as HeuristicGameKey] ?? null;
}

/** Every field set to its default — the form's starting selections. */
export function defaultHeuristicSelections(gameKey: string): Record<string, string> | null {
  const fields = heuristicFieldsFor(gameKey);
  if (!fields) return null;
  return Object.fromEntries(fields.map((field) => [field.key, field.defaultValue]));
}

/**
 * Wraps the form's selections under the shared extra key, repairing any
 * value that is not one of the field's options back to its default and
 * dropping keys that are not fields of this game. Null when the game has
 * no tunables — nothing is written into config.extra then.
 */
export function buildHeuristicsExtra(
  gameKey: string,
  selections: Record<string, string>,
): Record<string, unknown> | null {
  const fields = heuristicFieldsFor(gameKey);
  if (!fields) return null;
  const sanitized = Object.fromEntries(
    fields.map((field) => {
      const chosen = selections[field.key];
      const valid = field.options.some((option) => option.value === chosen);
      return [field.key, valid ? chosen : field.defaultValue];
    }),
  );
  return { [HEURISTICS_EXTRA_KEY]: sanitized };
}

/**
 * Merges the power-user textarea config with the dropdowns' heuristics
 * block. Heuristics win on key collision; nothing from either side yields
 * undefined so the wire payload stays clean.
 */
export function mergeExtraConfig(
  textareaExtra: Record<string, unknown> | undefined,
  heuristicsExtra: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (textareaExtra === undefined && heuristicsExtra === null) return undefined;
  return { ...(textareaExtra ?? {}), ...(heuristicsExtra ?? {}) };
}

/**
 * The inverse, for run-again prefills (?fromJob=): recovers the dropdown
 * selections through the shared `parseHeuristics` validator (null when the
 * game has no tunables or the stored block is garbled — the form then
 * starts from defaults) and hands everything else back to the textarea.
 */
export function splitHeuristicsExtra(
  gameKey: string,
  extra: Record<string, unknown> | undefined,
): { selections: Record<string, string> | null; rest: Record<string, unknown> | undefined } {
  const selections = parseHeuristics(gameKey, extra);
  if (extra === undefined) return { selections, rest: undefined };
  const { [HEURISTICS_EXTRA_KEY]: _heuristics, ...rest } = extra;
  return { selections, rest: Object.keys(rest).length > 0 ? rest : undefined };
}
