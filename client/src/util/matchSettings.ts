/**
 * Per-game match settings (the "Match settings" disclosure on a game's
 * section page): whether finishing a game automatically queues the next
 * one, and after how many games the automation stops.
 *
 * Persisted per game in localStorage, which is a trust boundary — other
 * tabs, older builds, or hand edits can leave anything there — so parsing
 * is total: any garbage degrades to the defaults, and a tampered limit is
 * clamped back into the supported set.
 */

/** The selectable requeue caps; 0 renders as "off" (no cap). */
export const REQUEUE_LIMIT_OPTIONS = [0, 3, 5, 10] as const;

export type RequeueLimit = (typeof REQUEUE_LIMIT_OPTIONS)[number];

export interface MatchSettings {
  /** Queue again automatically after each game. */
  autoRequeue: boolean;
  /** Stop auto-requeueing after this many games; 0 = no cap. */
  requeueLimit: RequeueLimit;
}

export const defaultMatchSettings: MatchSettings = { autoRequeue: false, requeueLimit: 0 };

/** localStorage key, namespaced per game under the app's gnarena: prefix. */
export function matchSettingsKey(gameKey: string): string {
  return `gnarena:matchSettings:${gameKey}`;
}

/**
 * Coerces any value onto the supported limit scale: allowed values pass
 * through, anything between two options rounds DOWN (never extend the cap
 * past what was chosen), and non-integers / negatives / non-numbers mean
 * "off".
 */
export function clampRequeueLimit(value: unknown): RequeueLimit {
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  let best: RequeueLimit = 0;
  for (const option of REQUEUE_LIMIT_OPTIONS) {
    if (option <= value && option >= best) best = option;
  }
  return best;
}

export function serializeMatchSettings(settings: MatchSettings): string {
  return JSON.stringify(settings);
}

/** Total parser: null / garbled / tampered input all land on safe values. */
export function parseMatchSettings(raw: string | null): MatchSettings {
  if (raw === null) return defaultMatchSettings;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultMatchSettings;
    const record = parsed as Record<string, unknown>;
    return {
      autoRequeue: record.autoRequeue === true,
      requeueLimit: clampRequeueLimit(record.requeueLimit),
    };
  } catch {
    return defaultMatchSettings;
  }
}
