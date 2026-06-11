/**
 * server/src/services/deploymentList.service.ts
 * ===============================================
 * Read-only deployment views for the trainer dashboard: the DeploymentRecord
 * joined with its model's display name, the owner, artifact presence, and
 * the model's REAL arena rating (RatingRepo) when one exists.
 *
 * Deliberately read-only — deploy / pause / retire mutations stay with the
 * existing model.controller endpoints. Tolerant of drift like every other
 * read path: missing models/owners render as "unknown" rather than 500ing
 * (auditTrainingDataIntegrity is how drift gets surfaced).
 */

import { ratingKey } from "../models.ts";
import type { DeploymentView, DeploymentViewListPage } from "@gamenite/shared";
import { DeploymentRepo, ModelRepo, RatingRepo, UserRepo } from "../repository.ts";

async function populateDeploymentView(deploymentId: string): Promise<DeploymentView> {
  const record = await DeploymentRepo.get(deploymentId);
  const model = await ModelRepo.find(record.modelId);
  const owner = await UserRepo.find(record.userId);
  const rating = await RatingRepo.find(
    ratingKey({ entityType: "ai", entityId: record.modelId, gameKey: record.gameKey }),
  );

  return {
    deploymentId,
    modelId: record.modelId,
    modelDisplayName: model?.displayName ?? "unknown model",
    owner: owner
      ? { username: owner.username, display: owner.display }
      : { username: "unknown", display: "Unknown user" },
    gameKey: record.gameKey,
    displayName: record.displayName,
    status: record.status,
    hasArtifact: Boolean(model?.artifactRef),
    rating: rating ? { rating: rating.rating, gamesPlayed: rating.gamesPlayed } : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Newest-first deployment views, optionally filtered to one owner. */
export async function listDeploymentViews(opts: {
  username?: string;
}): Promise<DeploymentViewListPage> {
  const keys = await DeploymentRepo.getAllKeys();
  const all = await Promise.all(keys.map((key) => populateDeploymentView(key)));

  const filtered = opts.username
    ? all.filter((view) => view.owner.username === opts.username)
    : all;
  filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { deployments: filtered, total: filtered.length };
}
