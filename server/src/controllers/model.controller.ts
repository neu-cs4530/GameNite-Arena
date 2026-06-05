/**
 * server/src/controllers/model.controller.ts
 * ============================================
 * REST endpoints for AI model upload, retrieval, and deployment management.
 *
 * Routes (register in app.ts under /api/model):
 *   POST   /api/model/upload              — upload a .pth artifact
 *   GET    /api/model/:id                 — get model by id
 *   GET    /api/model/user/:username      — get all models for a user
 *   POST   /api/model/:id/deploy          — deploy a model (create deployment slot)
 *   PATCH  /api/model/deployment/:id      — update deployment status (pause/retire)
 */

import multer, { type FileFilterCallback } from "multer";
import * as path from "node:path";
import * as fs from "node:fs";
import { type Request, type Response } from "express";
import { z } from "zod";
import { withAuth } from "@gamenite/shared";
import { type RestAPI } from "../types.ts";
import { checkAuth } from "../services/auth.service.ts";
import {
  uploadModel,
  getModelById,
  getModelsByUser,
  deployModel,
  updateDeploymentStatus,
  type ModelInfo,
  type DeploymentInfo,
} from "../services/model.service.ts";
import { UserRepo } from "../repository.ts";
import { submitTrainingJob } from "../services/trainingQueue.service.ts";
import { randomUUID } from "node:crypto";

// Multer configuration

const MODEL_STORE = path.resolve("models");
if (!fs.existsSync(MODEL_STORE)) {
  fs.mkdirSync(MODEL_STORE, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => cb(null, MODEL_STORE),
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
    // optional: if provided, kick off a training job immediately after upload
    trainingConfig: z
      .object({
        epochs: z.number().int().min(1),
        hyperparameters: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
  }),
);

const zDeployBody = withAuth(
  z.object({
    displayName: z.string().optional(),
  }),
);

const zStatusBody = withAuth(z.enum(["active", "paused", "retired"]));

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

    // If trainingConfig is provided, submit a training job immediately (CoS 2.2)
    if (body.data.payload.trainingConfig) {
      await submitTrainingJob({
        jobId: randomUUID(),
        modelId: model.modelId,
        userId: user.userId,
        modelStorageKey: file.path,
        config: {
          epochs: body.data.payload.trainingConfig.epochs,
          hyperparameters: body.data.payload.trainingConfig.hyperparameters,
        },
      });
    }

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
 * Creates a DeploymentRecord for the model (CoS 2.5, 2.7)
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
