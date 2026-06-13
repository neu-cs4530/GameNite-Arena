import { z } from "zod";

/**
 * Per-game training heuristics — the user-tunable choices about HOW a
 * model trains, picked on the new-run form and applied by the local
 * trainer CLI on the user's machine.
 *
 * The values ride in `config.extra[HEURISTICS_EXTRA_KEY]` on the training
 * job, so the wire contract (zStartTrainingSession) needs no change. The
 * trainer reads them back from `GET /api/training/:jobId` after attaching;
 * config extras are public, so nothing secret belongs here.
 *
 * Adding a game = add a schema + a field list here; the form renders from
 * the field list, the server validates with the schema, and the python
 * trainer maps each value onto env parameters. No UI code changes.
 */

/** One selectable value of a heuristic, with copy the form can render. */
export interface HeuristicOption {
  value: string;
  label: string;
  description: string;
}

/** One dropdown on the new-run form. */
export interface HeuristicField {
  key: string;
  label: string;
  description: string;
  options: HeuristicOption[];
  defaultValue: string;
}

/** Where heuristic values live inside TrainingConfig.extra. */
export const HEURISTICS_EXTRA_KEY = "heuristics";

export type NimHeuristics = z.infer<typeof zNimHeuristics>;
export const zNimHeuristics = z.object({
  /** Who the model trains against. */
  opponentStyle: z
    .enum(["misere-blunder-25", "misere-blunder-15", "uniform-random"])
    .default("misere-blunder-25"),
  /** Fixed starts match the arena; random starts give denser learning signal. */
  startingPile: z.enum(["random-8-21", "fixed-21"]).default("random-8-21"),
  /** Optional potential-based shaping — guides exploration, never changes the optimal policy. */
  rewardShaping: z.enum(["none", "potential-mod4"]).default("none"),
});

/** Per-game heuristic schemas. A game with no entry has no tunables yet. */
export const trainingHeuristicSchemas = {
  nim: zNimHeuristics,
} as const;

export type HeuristicGameKey = keyof typeof trainingHeuristicSchemas;

/** Form metadata, keyed identically to the schemas. */
export const trainingHeuristicFields: Record<HeuristicGameKey, HeuristicField[]> = {
  nim: [
    {
      key: "opponentStyle",
      label: "Training opponent",
      description: "Who your model plays against while it learns.",
      defaultValue: "misere-blunder-25",
      options: [
        {
          value: "misere-blunder-25",
          label: "Optimal, 25% blunders",
          description: "Plays the perfect misère line but blunders a quarter of its moves.",
        },
        {
          value: "misere-blunder-15",
          label: "Optimal, 15% blunders",
          description: "Tougher: fewer mistakes to capitalize on.",
        },
        {
          value: "uniform-random",
          label: "Random mover",
          description: "Takes 1-3 at random — easy mode, weak resulting model.",
        },
      ],
    },
    {
      key: "startingPile",
      label: "Starting position",
      description: "Where each training game begins.",
      defaultValue: "random-8-21",
      options: [
        {
          value: "random-8-21",
          label: "Random pile (8-21)",
          description: "Varied positions — denser learning signal.",
        },
        {
          value: "fixed-21",
          label: "Arena pile (21)",
          description: "Always the arena's starting position.",
        },
      ],
    },
    {
      key: "rewardShaping",
      label: "Reward shaping",
      description: "Optional dense guidance on top of win/loss.",
      defaultValue: "none",
      options: [
        {
          value: "none",
          label: "Win/loss only",
          description: "Pure game outcome — the model discovers structure itself.",
        },
        {
          value: "potential-mod4",
          label: "Position potential",
          description:
            "Small potential-based bonus for reaching strong positions; provably never changes what the best policy is.",
        },
      ],
    },
  ],
};

/**
 * Validates the heuristics for a game from a job's config.extra, applying
 * defaults; returns null when the game has no heuristics or the value is
 * missing/garbled (the trainer then uses the game's defaults).
 */
export function parseHeuristics(
  gameKey: string,
  extra: Record<string, unknown> | undefined,
): Record<string, string> | null {
  const schema = trainingHeuristicSchemas[gameKey as HeuristicGameKey];
  if (!schema) return null;
  const raw = extra?.[HEURISTICS_EXTRA_KEY];
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}
