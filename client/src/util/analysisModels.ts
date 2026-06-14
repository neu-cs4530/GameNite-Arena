import type { DeploymentView, TrainerGameKey } from "@gamenite/shared";

/**
 * One selectable engine in the replay viewer's "Analyze" control: a model the
 * signed-in user has deployed that is eligible to analyze the current replay.
 */
export interface AnalysisModelOption {
  deploymentId: string;
  /** The model's canonical name (what the user thinks of the bot as). */
  modelDisplayName: string;
  gameKey: TrainerGameKey;
  /** The model's Glicko rating for this game, when it has rated games. */
  rating?: number;
  /** Ready-to-render option text: name, plus rating when one exists. */
  label: string;
}

/**
 * The user's deployed models eligible to analyze a replay of `gameKey`:
 *
 *  - same game (a nim bot can't reason about a connect4 board),
 *  - currently `active` (paused/retired models aren't offered), and
 *  - backed by a stored artifact — no `.pth` means the engine has nothing to
 *    load, so the deployment can't actually run.
 *
 * Strongest-rated first, then alphabetical, so the natural default selection
 * is the user's best bot for that game. Pure so the viewer can unit-test the
 * selection logic without rendering.
 */
export function analysisModelOptions(
  deployments: DeploymentView[],
  gameKey: string,
): AnalysisModelOption[] {
  return deployments
    .filter((d) => d.gameKey === gameKey && d.status === "active" && d.hasArtifact)
    .map((d) => ({
      deploymentId: d.deploymentId,
      modelDisplayName: d.modelDisplayName,
      gameKey: d.gameKey,
      rating: d.rating?.rating,
      label: d.rating
        ? `${d.modelDisplayName} (${Math.round(d.rating.rating)})`
        : d.modelDisplayName,
    }))
    .sort((a, b) => {
      const ra = a.rating ?? -Infinity;
      const rb = b.rating ?? -Infinity;
      if (rb !== ra) return rb - ra;
      return a.modelDisplayName.localeCompare(b.modelDisplayName);
    });
}
