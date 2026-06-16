import type { DeploymentView, GameKey } from "@gamenite/shared";

/** One selectable AI solver in the daily-puzzle "Solver" picker. */
export interface PuzzleSolverOption {
  deploymentId: string;
  /** Ready-to-render label: the model's name, plus its rating when known. */
  label: string;
}

/**
 * The signed-in user's deployed models eligible to attempt a daily puzzle for
 * `gameKey`: same game, currently `active`, and artifact-backed (an AI needs a
 * stored .pth to run inference). Strongest-rated first, labeled with the
 * rating when known — mirrors the matchmaking seat picker. Pure so the picker
 * logic is unit-testable.
 */
export function puzzleSolverOptions(
  deployments: DeploymentView[],
  gameKey: GameKey,
): PuzzleSolverOption[] {
  return deployments
    .filter((d) => d.gameKey === gameKey && d.status === "active" && d.hasArtifact)
    .sort((a, b) => (b.rating?.rating ?? -Infinity) - (a.rating?.rating ?? -Infinity))
    .map((d) => ({
      deploymentId: d.deploymentId,
      label: d.rating ? `${d.displayName} · ${Math.round(d.rating.rating)}` : d.displayName,
    }));
}
