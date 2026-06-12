/**
 * Trainer training-job service functions — REAL only.
 *
 * Every surface (dashboard, new run, live page, model card) reads and
 * writes the live session API (`/api/training/...`) and the socket.io
 * progress bridge; what they show is what a real run produced. There is no
 * mock mode, no flag, and no fixture-id shim.
 */

import { io as connectSocket, type Socket } from "socket.io-client";
import {
  SocketEvents,
  type TrainingSessionInfo,
  type TrainingSessionListPage,
  type TrainingTokenInfo,
  type UserAuth,
} from "@gamenite/shared";
import type { SubmitJobPayload, TrainingJobDetail, TrainingStreamEvent } from "../util/types.ts";
import { api } from "./api.ts";
import { mapSessionToJobDetail } from "./trainingMapper.ts";

/** Lazy socket dedicated to training progress (the app socket lives in App.tsx). */
let trainingSocket: Socket | null = null;
function getTrainingSocket(): Socket {
  if (trainingSocket === null) trainingSocket = connectSocket();
  return trainingSocket;
}

/** Pull the server's {error} body out of an axios rejection, if present. */
function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Every session the user owns, newest-first, mapped to the client shape. */
export async function listSessionsFor(username: string): Promise<TrainingJobDetail[]> {
  const { data } = await api.get<TrainingSessionListPage>("/api/training/list", {
    params: { username, pageSize: 100 },
  });
  return data.jobs.map(mapSessionToJobDetail);
}

/** One session by id. Unknown ids are real errors. */
export async function getJob(jobId: string): Promise<TrainingJobDetail> {
  const { data } = await api.get<TrainingSessionInfo>(`/api/training/${jobId}`);
  return mapSessionToJobDetail(data);
}

/**
 * Register a training session. The run starts queued; a local trainer
 * attaches with `--job-id <returned id>` and the live page takes over.
 */
export async function submitJob(
  payload: SubmitJobPayload,
  auth: UserAuth,
): Promise<{ jobId: string }> {
  try {
    const { data } = await api.post<TrainingSessionInfo>("/api/training/submit", {
      auth,
      payload: {
        gameKey: payload.gameKey,
        modelId: payload.modelId,
        modelDisplayName: payload.modelDisplayName,
        config: {
          episodes: payload.hyperparameters.episodes,
          learningRate: payload.hyperparameters.learningRate,
          extra: payload.hyperparameters.extraConfig,
        },
      },
    });
    return { jobId: data.jobId };
  } catch (err) {
    throw new Error(extractApiError(err, "Could not register the training session"));
  }
}

/**
 * Mint an expiring training token (POST /api/training/token). The connect
 * card embeds it in the copyable bootstrap command so the user's password
 * never appears on the page or in their shell history.
 */
export async function mintTrainingToken(auth: UserAuth): Promise<TrainingTokenInfo> {
  try {
    const { data } = await api.post<TrainingTokenInfo>("/api/training/token", {
      auth,
      payload: {},
    });
    return data;
  } catch (err) {
    throw new Error(extractApiError(err, "Could not mint a training token"));
  }
}

/**
 * Cancel a queued/running session. The local trainer finds out on its next
 * progress report — the response status is the cancel control channel.
 */
export async function cancelJob(jobId: string, auth: UserAuth): Promise<void> {
  try {
    await api.post(`/api/training/${jobId}/cancel`, { auth, payload: {} });
  } catch (err) {
    throw new Error(extractApiError(err, "Could not cancel the training session"));
  }
}

/** The trained `.pth` artifact, exactly as stored by the platform. */
export async function downloadArtifact(jobId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/training/${jobId}/artifact`, {
    responseType: "blob",
  });
  return data;
}

/**
 * Live progress: joins the per-job socket.io room served by the training
 * progress bridge. New subscribers receive the last-event snapshot, then
 * every event as the trainer reports.
 */
export function subscribeLiveProgress(
  jobId: string,
  cb: (event: TrainingStreamEvent) => void,
): () => void {
  const socket = getTrainingSocket();
  const handler = (event: TrainingStreamEvent) => {
    if (event.jobId === jobId) cb(event);
  };
  socket.on(SocketEvents.progress, handler);
  socket.emit(SocketEvents.subscribe, { jobId });
  return () => {
    socket.emit(SocketEvents.unsubscribe, { jobId });
    socket.off(SocketEvents.progress, handler);
  };
}
