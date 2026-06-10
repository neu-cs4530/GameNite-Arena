/**
 * server/src/controllers/training.controller.ts
 * ================================================
 * REST endpoints for LOCAL training sessions: the user's machine runs the
 * training loop (ai/session_reporter.py) and talks to these routes; the
 * dashboard reads them. Mounted in app.ts under /api/training via
 * trainingRouter() — tests mount the identical router, so the spec and the
 * runtime share one route table.
 *
 *   POST /api/training/submit            — register a session (web UI or CLI)
 *   GET  /api/training/list              — list sessions (?username= filter)
 *   GET  /api/training/:jobId            — one session
 *   POST /api/training/:jobId/progress   — local trainer progress report
 *   POST /api/training/:jobId/complete   — local trainer finished
 *   POST /api/training/:jobId/fail       — local trainer crashed
 *   POST /api/training/:jobId/cancel     — stop the run (trainer sees it on
 *                                          its next progress response)
 *   POST /api/training/:jobId/artifact   — upload the trained .pth (multipart;
 *                                          `auth` is a JSON-string field)
 *   GET  /api/training/:jobId/artifact   — download the trained .pth
 *
 * NOTE: deliberately self-contained (own multer block, no imports from
 * model.controller.ts) so importing this file never drags in the
 * Redis-backed queue modules — that keeps router-only tests Redis-free.
 */

import express, { type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import * as path from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import {
  withAuth,
  zUserAuth,
  zStartTrainingSession,
  zReportTrainingProgress,
  zCompleteTrainingSession,
  zFailTrainingSession,
  type TrainingSessionInfo,
  type TrainingSessionListPage,
} from "@gamenite/shared";
import { type RestAPI } from "../types.ts";
import { checkAuth } from "../services/auth.service.ts";
import {
  startTrainingSession,
  reportTrainingProgress,
  completeTrainingSession,
  failTrainingSession,
  cancelTrainingSession,
  bindSessionArtifact,
  getSessionArtifactPath,
  getTrainingSession,
  listTrainingSessions,
} from "../services/trainingSession.service.ts";

// Multer configuration (same conventions as model.controller.ts)

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

const uploadArtifact = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!file.originalname.endsWith(".pth")) {
      cb(new Error("Only .pth files are accepted"));
      return;
    }
    cb(null, true);
  },
}).single("file");

/** Surfaces multer errors (bad extension, size cap) as 400s instead of 500s. */
const uploadArtifactMw: RequestHandler = (req, res, next) => {
  uploadArtifact(req, res, (err: unknown) => {
    if (err) {
      res.status(400).send({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    next();
  });
};

// Error mapping

/** Service error message -> HTTP status, mirroring model.controller.ts. */
function statusForError(msg: string): number {
  if (msg.includes("not found")) return 404;
  if (msg.includes("not own")) return 403;
  if (msg.includes("already")) return 409;
  return 422;
}

function sendServiceError(res: Response<{ error: string }>, err: unknown): void {
  const msg = err instanceof Error ? err.message : "Request failed";
  res.status(statusForError(msg)).send({ error: msg });
}

// Zod validators

const zSubmitBody = withAuth(zStartTrainingSession);
const zProgressBody = withAuth(zReportTrainingProgress);
const zCompleteBody = withAuth(zCompleteTrainingSession);
const zFailBody = withAuth(zFailTrainingSession);
const zCancelBody = withAuth(z.object({}));

// Controllers

/** POST /api/training/submit */
export const postSubmit: RestAPI<TrainingSessionInfo> = async (req, res) => {
  const body = zSubmitBody.safeParse(req.body);
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
    res.status(201).send(await startTrainingSession(user, body.data.payload));
  } catch (err) {
    sendServiceError(res, err);
  }
};

/** GET /api/training/list?username=&page=&pageSize= */
export const getList: RestAPI<TrainingSessionListPage> = async (req, res) => {
  const username =
    typeof req.query.username === "string" && req.query.username !== ""
      ? req.query.username
      : undefined;
  const page = parsePositiveInt(req.query.page);
  const pageSize = parsePositiveInt(req.query.pageSize);
  res.send(await listTrainingSessions({ username, page, pageSize }));
};

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** GET /api/training/:jobId */
export const getById: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const info = await getTrainingSession(req.params.jobId);
  if (!info) {
    res.status(404).send({ error: `Training session ${req.params.jobId} not found` });
    return;
  }
  res.send(info);
};

/** POST /api/training/:jobId/progress */
export const postProgress: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const body = zProgressBody.safeParse(req.body);
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
    res.send(await reportTrainingProgress(user, req.params.jobId, body.data.payload));
  } catch (err) {
    sendServiceError(res, err);
  }
};

/** POST /api/training/:jobId/complete */
export const postComplete: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const body = zCompleteBody.safeParse(req.body);
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
    res.send(await completeTrainingSession(user, req.params.jobId, body.data.payload));
  } catch (err) {
    sendServiceError(res, err);
  }
};

/** POST /api/training/:jobId/fail */
export const postFail: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const body = zFailBody.safeParse(req.body);
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
    res.send(await failTrainingSession(user, req.params.jobId, body.data.payload));
  } catch (err) {
    sendServiceError(res, err);
  }
};

/** POST /api/training/:jobId/cancel */
export const postCancel: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const body = zCancelBody.safeParse(req.body);
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
    res.send(await cancelTrainingSession(user, req.params.jobId));
  } catch (err) {
    sendServiceError(res, err);
  }
};

/**
 * POST /api/training/:jobId/artifact
 *
 * Multipart fields arrive as flat strings, so `auth` is sent as ONE
 * JSON-string field and parsed here (multer's field parser does not build
 * nested objects from auth[username]-style names reliably across clients).
 */
export const postArtifact: RestAPI<TrainingSessionInfo, { jobId: string }> = async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).send({ error: "No .pth file provided" });
    return;
  }
  const removeUpload = () => {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // already gone — nothing to clean up
    }
  };

  let auth: z.infer<typeof zUserAuth>;
  try {
    auth = zUserAuth.parse(JSON.parse(String((req.body as Record<string, unknown>)?.auth)));
  } catch {
    removeUpload();
    res.status(400).send({ error: "Invalid auth field (expected a JSON string)" });
    return;
  }

  const user = await checkAuth(auth);
  if (!user) {
    removeUpload();
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  try {
    res.send(await bindSessionArtifact(user, req.params.jobId, file.path));
  } catch (err) {
    removeUpload();
    sendServiceError(res, err);
  }
};

/** GET /api/training/:jobId/artifact */
export const getArtifact: RestAPI<never, { jobId: string }> = async (req, res) => {
  const artifactPath = await getSessionArtifactPath(req.params.jobId);
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    res.status(404).send({ error: "No artifact uploaded for this session" });
    return;
  }
  res.download(artifactPath);
};

// Router (shared between app.ts and the controller spec)

export function trainingRouter(): express.Router {
  return express
    .Router()
    .post("/submit", postSubmit)
    .get("/list", getList)
    .get("/:jobId", getById)
    .post("/:jobId/progress", postProgress)
    .post("/:jobId/complete", postComplete)
    .post("/:jobId/fail", postFail)
    .post("/:jobId/cancel", postCancel)
    .post("/:jobId/artifact", uploadArtifactMw, postArtifact)
    .get("/:jobId/artifact", getArtifact);
}
