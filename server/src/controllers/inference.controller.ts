/**
 * server/src/controllers/inference.controller.ts
 * ================================================
 * Machine-to-machine endpoints for the self-hosted inference box, mounted at
 * /api/inference via inferenceRouter() (tests mount the identical router).
 *
 *   GET /api/inference/artifact/:modelId   stream the stored <modelId>.pth
 *
 * Render stays the canonical artifact store. The box pulls a model's .pth from
 * here the first time it needs it, then caches it locally (lazy pull-and-cache
 * on the Python side). The path is resolved ONLY through the artifact store's
 * resolveArtifactRef(artifactRefForModel(...)), which rejects absolute paths
 * and anything that escapes the root — so a traversal-shaped :modelId can never
 * steer this past the store, and a missing file is a clean 404.
 *
 * Auth is the shared-token gate (requireInferenceToken), NOT user body-auth.
 */

import express from "express";
import { type RestAPI } from "../types.ts";
import { artifactRefForModel, resolveArtifactRef } from "../services/artifactStore.service.ts";
import { requireInferenceToken } from "../services/inferenceAuth.ts";

// resolved is a trusted absolute path inside ARTIFACT_ROOT. The repo (and so
// the store) may live under a dotfile directory (e.g. a .claude worktree);
// allow dotfile path segments so the send layer does not reject the trusted
// path it was just handed. `as const` keeps the literal "allow" rather than
// widening to string (which the download() options type rejects).
const artifactDownloadOptions = { dotfiles: "allow" } as const;

/**
 * GET /api/inference/artifact/:modelId
 * Streams the canonical artifact file for a model. 404 when no artifact is
 * stored (or the ref resolves to nothing — including traversal attempts).
 */
export const getArtifact: RestAPI<never, { modelId: string }> = async (req, res) => {
  const ref = artifactRefForModel(req.params.modelId);
  const resolved = resolveArtifactRef(ref);
  if (resolved === null) {
    res.status(404).send({ error: "Artifact not found" });
    return;
  }
  await new Promise<void>((resolve) => {
    res.download(resolved, ref, artifactDownloadOptions, (err) => {
      if (err !== undefined && err !== null && !res.headersSent) {
        res.status(404).send({ error: "Artifact not found" });
      }
      resolve();
    });
  });
};

export function inferenceRouter(): express.Router {
  return express.Router().get("/artifact/:modelId", requireInferenceToken, getArtifact);
}
