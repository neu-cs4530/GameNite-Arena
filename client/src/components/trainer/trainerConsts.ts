/**
 * Trainer-internal constants & helpers used across the trainer surface.
 * Lives next to the components so we don't have to touch util/consts.ts.
 */

import type { BadgeVariant } from "../ui/Badge.tsx";
import type { JobStatus, TrainerGameKey, TrainingMode } from "../../util/types.ts";

/** Display labels for trainer-supported games. Mirrors `replayGameNames`. */
export const trainerGameNames: Record<TrainerGameKey, string> = {
  nim: "Nim",
  guess: "Number Guesser",
  checkers: "Checkers",
  connect4: "Connect 4",
  tictactoe: "Tic-Tac-Toe",
};

/** Short glyph for the game in cards. Mirrors `replayGameIcons`. */
export const trainerGameIcons: Record<TrainerGameKey, string> = {
  nim: "○",
  guess: "?",
  checkers: "◆",
  connect4: "●",
  tictactoe: "✕",
};

export const trainingModeByGame: Record<TrainerGameKey, TrainingMode> = {
  nim: "self-play",
  guess: "environment-driven",
  checkers: "self-play",
  connect4: "self-play",
  tictactoe: "self-play",
};

/** Maps job status to a Badge variant. */
export const jobStatusVariant: Record<JobStatus, BadgeVariant> = {
  queued: "info",
  running: "live",
  completed: "success",
  failed: "danger",
  canceled: "default",
};

/** Maps job status to a human label. */
export const jobStatusLabel: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

/** localStorage key for the notify-on-complete preference per job. */
export function notifyOnCompleteKey(jobId: string): string {
  return `gnarena:notifyOnComplete:${jobId}`;
}

/** Hyperparameter presets surfaced as one-click buttons on the form. */
export const hyperparamPresets: Record<
  "aggressive" | "balanced" | "conservative",
  { episodes: number; learningRate: number; description: string }
> = {
  aggressive: {
    episodes: 1_000_000,
    learningRate: 1e-3,
    description: "Fast convergence, more compute.",
  },
  balanced: { episodes: 100_000, learningRate: 3e-4, description: "Default starting point." },
  conservative: { episodes: 50_000, learningRate: 1e-4, description: "Stable, lower compute." },
};
