import { AI_PLAYABLE_GAME_KEYS, type DeploymentView, type GameKey } from "@gamenite/shared";
import { findSelfEntry } from "../util/leaderboardView.ts";
import type { LeaderboardEntry } from "../util/types.ts";

/**
 * Pure view-model for the per-game section page (/games/:gameKey): who can
 * take the seat, what the stats strip shows, and where the Play CTAs go.
 * The page component only wires fetches and navigation onto these.
 */

/** One-line framing under each game's hero. Total over playable games. */
export function sectionLede(gameKey: GameKey): string {
  switch (gameKey) {
    case "nim":
      return "Take 1–3 from the pile — whoever takes the last object loses.";
    case "guess":
      return "Pick a secret number, then out-guess your opponent.";
    case "tictactoe":
      return "Line up three in a row before your opponent does.";
    case "connect4":
      return "Drop discs to connect four in a row — across, down, or diagonally.";
    case "checkers":
      return "Capture every enemy piece, or leave them with no move.";
  }
}

/** Whether deployed models can be queued for this game (shared contract). */
export function isAiPlayable(gameKey: GameKey): boolean {
  return AI_PLAYABLE_GAME_KEYS.includes(gameKey);
}

/** The viewer's deployments that could take this game's seat right now. */
export function activeDeploymentsFor(
  deployments: DeploymentView[],
  gameKey: GameKey,
): DeploymentView[] {
  return deployments.filter((d) => d.gameKey === gameKey && d.status === "active");
}

/** Who plays: the user themselves, or one of their deployed models. */
export type SeatSelection = { kind: "self" } | { kind: "deployment"; deployment: DeploymentView };

/** The "Myself" choice — always present and always first. */
export const SELF_SEAT_VALUE = "self";

export interface SeatOption {
  value: string;
  label: string;
  /** The model's arena rating, rounded — only when it has rated games. */
  rating?: number;
}

/** Options for the "Who plays?" control: Myself first, then deployments. */
export function seatOptions(deployments: DeploymentView[]): SeatOption[] {
  return [
    { value: SELF_SEAT_VALUE, label: "Myself" },
    ...deployments.map((d) => ({
      value: d.deploymentId,
      label: d.displayName,
      ...(d.rating ? { rating: Math.round(d.rating.rating) } : {}),
    })),
  ];
}

/**
 * Resolves the stored seat choice against the live deployment list. A stale
 * id (deployment paused/retired since the page loaded, or restored from an
 * old session) silently falls back to playing yourself — never a dead seat.
 */
export function resolveSeat(value: string, deployments: DeploymentView[]): SeatSelection {
  if (value !== SELF_SEAT_VALUE) {
    const deployment = deployments.find((d) => d.deploymentId === value);
    if (deployment) return { kind: "deployment", deployment };
  }
  return { kind: "self" };
}

export interface CtaState {
  enabled: boolean;
  /** Why the Play buttons are disabled, shown under them. */
  reason?: string;
}

/**
 * Whether the Play CTAs are actionable for the chosen seat. The only seat
 * that cannot queue is a deployment whose model has no stored artifact —
 * the server would have nothing to run.
 */
export function ctaState(seat: SeatSelection): CtaState {
  if (seat.kind === "deployment" && !seat.deployment.hasArtifact) {
    return {
      enabled: false,
      reason: `${seat.deployment.displayName} has no trained artifact yet — finish a training run first.`,
    };
  }
  return { enabled: true };
}

/** The queue-page URL a Play CTA navigates to, seat included. */
export function queueHref(gameKey: GameKey, rated: boolean, seat: SeatSelection): string {
  const params = new URLSearchParams();
  params.set("rated", String(rated));
  if (seat.kind === "deployment") {
    params.set("deploymentId", seat.deployment.deploymentId);
    params.set("modelId", seat.deployment.modelId);
    params.set("modelName", seat.deployment.displayName);
  }
  return `/games/queue/${gameKey}?${params.toString()}`;
}

export interface SelfStats {
  rank: number;
  /** Rounded Glicko — display value. */
  rating: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** 0..1 fraction, formatted by the caller. */
  winRate: number;
}

/**
 * The viewer's stats strip, from their own row of the full board fetch
 * (type=all). Null until they have rated games — the strip then renders an
 * honest "unranked" state instead of zeros pretending to be data.
 */
export function deriveSelfStats(entries: LeaderboardEntry[], username: string): SelfStats | null {
  const self = findSelfEntry(entries, username);
  if (!self) return null;
  return {
    rank: self.rank,
    rating: Math.round(self.rating),
    rd: self.rd,
    gamesPlayed: self.gamesPlayed,
    wins: self.wins,
    losses: self.gamesPlayed - self.wins,
    winRate: self.winRate,
  };
}
