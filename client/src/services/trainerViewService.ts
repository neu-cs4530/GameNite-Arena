/**
 * Real-only reads for the trainer workflow surfaces (dashboard, live page).
 *
 * No mock fallbacks here by design: these surfaces are the proof that what
 * the platform shows comes from a real run, so an empty server answer
 * renders as a real empty state, never as fixture data. (The model
 * discovery pages — browse/card/fork — keep their fixture-backed services
 * until their endpoints land; that is the next de-mock block.)
 */

import type { DeploymentView, DeploymentViewListPage, TrainerGameKey } from "@gamenite/shared";
import { api } from "./api.ts";

/** Per-user per-game active-deployment cap (CoS 2.7, enforced server-side). */
export const DEPLOYMENT_CAP_PER_GAME = 3;

/** Newest-first deployment views for one user. */
export async function listDeploymentViews(username: string): Promise<DeploymentView[]> {
  const { data } = await api.get<DeploymentViewListPage>("/api/deployment/list", {
    params: { username },
  });
  return data.deployments;
}

/** Active deployments for one game — drives slot indicators and cap checks. */
export function countActiveForGame(views: DeploymentView[], gameKey: TrainerGameKey): number {
  return views.filter((v) => v.gameKey === gameKey && v.status === "active").length;
}

/** Wire shape of GET /api/model/user/:username (model.controller.ts). */
interface ModelInfoWire {
  modelId: string;
  owner: { username: string; display: string };
  gameKey: TrainerGameKey;
  displayName: string;
  artifactRef?: string;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface OwnModelView {
  modelId: string;
  displayName: string;
  gameKey: TrainerGameKey;
  visibility: "private" | "public";
  hasArtifact: boolean;
  updatedAt: string;
}

/** The signed-in user's models — newest-updated first. */
export async function listOwnModels(username: string): Promise<OwnModelView[]> {
  const { data } = await api.get<ModelInfoWire[]>(
    `/api/model/user/${encodeURIComponent(username)}`,
  );
  return data
    .map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
      gameKey: model.gameKey,
      visibility: model.visibility,
      hasArtifact: Boolean(model.artifactRef),
      updatedAt: model.updatedAt,
    }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
