/**
 * Trainer model service — REAL only. Every read and mutation here hits the
 * live REST API; an empty server answer renders as a real empty state and
 * an unknown id is a real error. (The client fixture these calls used to
 * fall back to is gone.)
 *
 * Server endpoints (server/src/controllers/model.controller.ts):
 *   GET  /api/model/user/:username  — all models owned by one user
 *   GET  /api/model/:id             — one model
 *   POST /api/model/:id/fork        — fork into a new model you own
 *
 * A global "all public models" list endpoint does not exist yet; the
 * browse page says so honestly instead of inventing one.
 */

import type { UserAuth } from "@gamenite/shared";
import type { ModelDetail, ModelSummary } from "../util/types.ts";
import { api } from "./api.ts";
import { mapModelInfoToDetail, mapModelInfoToSummary, type ModelInfoWire } from "./modelMapper.ts";

/** Pull the server's {error} body out of an axios rejection, if present. */
function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

/** The user's own models — the only model list the server exposes today. */
export async function listModels(username: string): Promise<ModelSummary[]> {
  const res = await api.get<ModelInfoWire[]>(`/api/model/user/${encodeURIComponent(username)}`);
  return res.data.map(mapModelInfoToSummary);
}

/** One model by id. A 404 propagates — the page shows a real error state. */
export async function getModel(modelId: string): Promise<ModelDetail> {
  try {
    const res = await api.get<ModelInfoWire>(`/api/model/${encodeURIComponent(modelId)}`);
    return mapModelInfoToDetail(res.data);
  } catch (err) {
    throw new Error(extractApiError(err, `Model not found: ${modelId}`));
  }
}

/**
 * Forks a model: `POST /api/model/:modelId/fork` with
 * `{ auth, payload: { displayName? } }` → 201 ModelInfo for the new fork.
 */
export async function forkModel(
  modelId: string,
  displayName: string,
  auth: UserAuth,
): Promise<{ modelId: string }> {
  try {
    const res = await api.post<ModelInfoWire>(`/api/model/${encodeURIComponent(modelId)}/fork`, {
      auth,
      payload: { displayName: displayName || undefined },
    });
    return { modelId: res.data.modelId };
  } catch (err) {
    throw new Error(extractApiError(err, "Could not fork the model"));
  }
}
