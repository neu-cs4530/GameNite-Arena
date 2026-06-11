import type { GameKey } from "@gamenite/shared";
import type { ReplayGameKey } from "./types.ts";

export const gameNames: { [key in GameKey]: string } = {
  nim: "Nim",
  guess: "Number Guesser",
};

/**
 * Display labels for every replay-supported game key, including games that
 * have replay views stubbed but no live play yet.
 */
export const replayGameNames: { [key in ReplayGameKey]: string } = {
  nim: "Nim",
  guess: "Number Guesser",
  checkers: "Checkers",
  connect4: "Connect 4",
  tictactoe: "Tic-Tac-Toe",
};

/** Short emoji/glyph shown alongside game labels in cards / strips. */
export const replayGameIcons: { [key in ReplayGameKey]: string } = {
  nim: "○",
  guess: "?",
  checkers: "◆",
  connect4: "●",
  tictactoe: "✕",
};

/**
 * Localstorage keys we own. The test agent has hard-coded the prefix
 * `gnarena:` in extra-features.e2e.spec.ts, so keep this in sync.
 */
export const lsKeys = {
  watchLater: "gnarena:watchLater",
  playbackSpeed: "gnarena:playbackSpeed",
  autoLoop: "gnarena:autoLoop",
  helpDismissed: "gnarena:helpDismissed",
  annotationReactions: "gnarena:annotationReactions",
} as const;

/**
 * The games a user can actually queue and play today, derived from the one
 * canonical map above — every "pick a game" surface (matchmaking,
 * leaderboards, puzzles) renders from this list, so adding a game here adds
 * it everywhere at once.
 */
export const PLAYABLE_GAME_KEYS = Object.keys(gameNames) as GameKey[];
