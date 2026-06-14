/**
 *
 * REST endpoints for AI model upload, retrieval, and deployment management.
 *
 * Routes (register in app.ts under /api/model):
 *   POST   /api/model/upload              — upload a .pth artifact
 *   GET    /api/model/:id                 — get model by id
 *   GET    /api/model/user/:username      — get all models for a user
 *   POST   /api/model/:id/deploy          — deploy a model (create deployment slot)
 *   PATCH  /api/model/deployment/:id      — update deployment status (pause/retire)
 *
 * Sprint 2 change: removed trainingConfig / submitTrainingJob block.
 * Server-side training is deferred post-demo. Users train locally with
 * base_adapter and upload the resulting .pth directly.
 */

import multer, { type FileFilterCallback } from "multer";
import * as fs from "node:fs";
import * as os from "node:os";
import { type Request, type Response } from "express";
import { z } from "zod";
import { withAuth } from "@gamenite/shared";
import { type RestAPI } from "../types.ts";
import { checkAuth } from "../services/auth.service.ts";
import {
  uploadModel,
  forkModel,
  getModelById,
  getModelsByUser,
  deployModel,
  updateDeploymentStatus,
  type ModelInfo,
  type DeploymentInfo,
} from "../services/model.service.ts";
import { UserRepo } from "../repository.ts";

// Multer — write to OS temp dir; model.service.ts uploads to R2 and cleans up.
const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => cb(null, os.tmpdir()),
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!file.originalname.endsWith(".pth")) {
      cb(new Error("Only .pth files are accepted"));
      return;
    }
    cb(null, true);
  },
}).single("file");

// Zod validators

const zMetadata = z.object({
  game: z.string(),
  adapterVersion: z.string(),
  trainedAt: z.number(),
});

const zUploadBody = withAuth(
  z.object({
    displayName: z.string().optional().default(""),
    metadata: z.string(),
  }),
);

const zDeployBody = withAuth(
  z.object({
    displayName: z.string().optional(),
  }),
);

const zStatusBody = withAuth(z.enum(["active", "paused", "retired"]));

const zForkBody = withAuth(
  z.object({
    displayName: z.string().max(120).optional(),
  }),
);

// Controllers

/**
 * POST /api/model/upload
 * Register after uploadMiddleware in app.ts:
 *   .post("/upload", model.uploadMiddleware, model.postUpload)
 */
export const postUpload: RestAPI<ModelInfo> = async (
  req: Request<Record<string, string>, ModelInfo | { error: string }, unknown>,
  res: Response<ModelInfo | { error: string }>,
) => {
  const file = req.file;
  if (!file) {
    res.status(400).send({ error: "No .pth file provided" });
    return;
  }

  const body = zUploadBody.safeParse(req.body);
  if (body.error) {
    fs.unlinkSync(file.path);
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    fs.unlinkSync(file.path);
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  let metadata: z.infer<typeof zMetadata>;
  try {
    metadata = zMetadata.parse(JSON.parse(body.data.payload.metadata));
  } catch {
    fs.unlinkSync(file.path);
    res.status(400).send({ error: "Invalid or missing .pth metadata field" });
    return;
  }

  try {
    const model = await uploadModel(user, file.path, body.data.payload.displayName, metadata);
    res.status(201).send(model);
  } catch (err) {
    res.status(422).send({ error: err instanceof Error ? err.message : "Upload failed" });
  }
};

/**
 * GET /api/model/:id
 */
export const getById: RestAPI<ModelInfo, { id: string }> = async (req, res) => {
  const model = await getModelById(req.params.id);
  if (!model) {
    res.status(404).send({ error: "Model not found" });
    return;
  }
  res.send(model);
};

/**
 * GET /api/model/user/:username
 */
export const getByUsername: RestAPI<ModelInfo[], { username: string }> = async (req, res) => {
  const allKeys = await UserRepo.getAllKeys();
  let userId: string | undefined;
  for (const key of allKeys) {
    const u = await UserRepo.find(key);
    if (u?.username === req.params.username) {
      userId = key;
      break;
    }
  }
  if (!userId) {
    res.status(404).send({ error: "User not found" });
    return;
  }
  const models = await getModelsByUser(userId);
  res.send(models);
};

/**
 * POST /api/model/:id/deploy
 * Creates a DeploymentRecord and loads the model into the inference service.
 */
export const postDeploy: RestAPI<DeploymentInfo, { id: string }> = async (req, res) => {
  const body = zDeployBody.safeParse(req.body);
  if (body.error) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  try {
    const deployment = await deployModel(user, req.params.id, body.data.payload.displayName);
    res.status(201).send(deployment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deploy failed";
    const status = msg.includes("not found") ? 404 : msg.includes("not own") ? 403 : 422;
    res.status(status).send({ error: msg });
  }
};

/**
 * POST /api/model/:modelId/fork
 * Copies a visible model into a NEW private record owned by the caller
 * (Story 2.13). No artifact is copied — forks retrain from scratch.
 */
export const postFork: RestAPI<ModelInfo, { modelId: string }> = async (req, res) => {
  const body = zForkBody.safeParse(req.body);
  if (body.error) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  try {
    const model = await forkModel(user, req.params.modelId, body.data.payload.displayName);
    res.status(201).send(model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fork failed";
    res.status(msg.includes("not found") ? 404 : 422).send({ error: msg });
  }
};

/**
 * PATCH /api/model/deployment/:id
 * Update deployment status — pause, resume, retire (CoS 2.9)
 */
export const patchDeploymentStatus: RestAPI<DeploymentInfo, { id: string }> = async (req, res) => {
  const body = zStatusBody.safeParse(req.body);
  if (body.error) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  try {
    const deployment = await updateDeploymentStatus(req.params.id, user, body.data.payload);
    res.send(deployment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    const status = msg.includes("not found") ? 404 : msg.includes("not own") ? 403 : 422;
    res.status(status).send({ error: msg });
  }
};
