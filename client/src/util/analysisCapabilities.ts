import { ENGINE_SOLVABLE_GAME_KEYS } from "@gamenite/shared";

/** What replay analysis is available for a given game + the viewer's models. */
export interface AnalysisCapabilities {
  /** The built-in closed-form engine can analyze this game (nim, tic-tac-toe). */
  engine: boolean;
  /** The viewer has at least one deployed model eligible to give AI insight. */
  ai: boolean;
}

/**
 * Which analysis affordances the replay viewer should offer for `gameKey`:
 *
 *  - the built-in engine is only meaningful for closed-form games
 *    (ENGINE_SOLVABLE_GAME_KEYS) — for every other game it has no verdict, so
 *    we hide it rather than show empty "neutral" output;
 *  - AI-model insight is available whenever the signed-in user has an eligible
 *    deployed model for the game (the caller decides eligibility and passes the
 *    boolean).
 *
 * When neither is available there is nothing to analyze and the viewer hides
 * the controls entirely. Pure, so the gating is unit-testable.
 */
export function analysisCapabilities(
  gameKey: string,
  hasEligibleModel: boolean,
): AnalysisCapabilities {
  return {
    engine: (ENGINE_SOLVABLE_GAME_KEYS as string[]).includes(gameKey),
    ai: hasEligibleModel,
  };
}
