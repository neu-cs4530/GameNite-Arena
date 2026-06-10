/**
 * Read projections for deployment surfaces (trainer dashboard).
 *
 * A deployment is a runtime slot holding a trained model
 * (DeploymentRecord, server/src/models.ts). These views are what
 * `GET /api/deployment/list` serves: the record plus the joins the
 * dashboard would otherwise have to fake — model display name, owner,
 * artifact presence, and the model's REAL arena rating when it has one.
 */

import type { TrainerGameKey } from "./trainingSession.types.ts";

export type DeploymentViewStatus = "active" | "paused" | "retired";

export interface DeploymentView {
  deploymentId: string;
  modelId: string;
  modelDisplayName: string;
  owner: { username: string; display: string };
  gameKey: TrainerGameKey;
  /** Display name chosen at deploy time (snapshot, may differ from model's). */
  displayName: string;
  status: DeploymentViewStatus;
  /** True when the model has a stored .pth in the artifact store. */
  hasArtifact: boolean;
  /** The model's Glicko rating for this game, when it has played rated games. */
  rating?: { rating: number; gamesPlayed: number };
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentViewListPage {
  deployments: DeploymentView[];
  total: number;
}
