/**
 * server/src/services/trainingWorker.ts
 *
 * Register at startup in server.ts:
 *   import { trainingProcessor } from "./services/trainingWorker.ts";
 *   import { registerTrainingWorker } from "./services/trainingQueue.service.ts";
 *   registerTrainingWorker(trainingProcessor);  // inside httpServer.listen callback
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import type { TrainingJobData, TrainingJobResult } from "@gamenite/shared";
import type { TrainingProcessor } from "./trainingQueue.service.ts";
import { ModelRepo, TrainingJobRepo } from "../repository.ts";

// Where model artifacts are stored on the host
const MODEL_STORE = path.resolve("models");

// Processor

export const trainingProcessor: TrainingProcessor = async (
  data: TrainingJobData,
  reportProgress: (update: {
    progress: number;
    epoch?: number;
    metrics?: Record<string, number>;
    message?: string;
  }) => Promise<void>,
): Promise<TrainingJobResult> => {
  const { jobId, modelId, config } = data;

  await updateJobStatus(jobId, "running");
  await reportProgress({ progress: 0, message: "Training job started" });

  const outputPath = path.join(MODEL_STORE, `trained-${modelId}-${Date.now()}.pth`);

  try {
    await runTrainingSubprocess(
      data.modelStorageKey,
      outputPath,
      config,
      async (epoch: number, metrics: Record<string, number>) => {
        const progress = config.epochs > 0 ? epoch / config.epochs : 0;
        await reportProgress({
          progress,
          epoch,
          metrics,
          message: `Epoch ${epoch}/${config.epochs} — winRate: ${metrics["winRate"]?.toFixed(3) ?? "?"}`,
        });
        await updateJobProgress(jobId, epoch, metrics);
      },
    );

    // Update model artifact ref on success
    const model = await ModelRepo.find(modelId);
    if (model) {
      model.artifactRef = outputPath;
      model.updatedAt = new Date().toISOString();
      await ModelRepo.set(modelId, model);
    }

    await updateJobStatus(jobId, "completed");
    await reportProgress({ progress: 1, message: "Training complete" });

    return {
      jobId,
      modelId,
      finalMetrics: { loss: 0, winRate: 0 },
      outputStorageKey: outputPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown training error";
    await updateJobStatus(jobId, "failed", message);
    throw err;
  }
};

// Subprocess runner

/**
 * Runs the adapter training script as a Python subprocess.
 *
 * The adapter script prints JSON progress lines to stdout:
 *   {"epoch": 10, "loss": 0.42, "winRate": 0.61, "meanReward": 0.3}
 *
 * Sprint 2 upgrade: replace spawn("python3") with Docker for sandbox isolation.
 */
async function runTrainingSubprocess(
  modelStorageKey: string,
  outputPath: string,
  config: TrainingJobData["config"],
  onProgress: (epoch: number, metrics: Record<string, number>) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(path.dirname(modelStorageKey), "run_training.py"),
      modelStorageKey,
      "--output",
      outputPath,
      "--epochs",
      String(config.epochs),
    ];

    if (config.hyperparameters) {
      args.push("--hyperparameters", JSON.stringify(config.hyperparameters));
    }

    const proc = spawn("python3", args);
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as {
            epoch?: number;
            loss?: number;
            winRate?: number;
            meanReward?: number;
          };
          if (parsed.epoch !== undefined) {
            void onProgress(parsed.epoch, {
              loss: parsed.loss ?? 0,
              winRate: parsed.winRate ?? 0,
              meanReward: parsed.meanReward ?? 0,
            });
          }
        } catch {
          // non-JSON stdout line — ignore
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Training subprocess exited with code ${code}:\n${stderr}`));
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start training subprocess: ${err.message}`));
    });
  });
}

// DB helpers

async function updateJobStatus(
  jobId: string,
  status: "running" | "completed" | "failed",
  error?: string,
): Promise<void> {
  const existing = await TrainingJobRepo.find(jobId);
  if (!existing) return;
  existing.status = status;
  if (status === "completed" || status === "failed") {
    existing.completedAt = new Date().toISOString();
  }
  if (error) existing.error = error;
  await TrainingJobRepo.set(jobId, existing);
}

async function updateJobProgress(
  jobId: string,
  episodes: number,
  metrics: Record<string, number>,
): Promise<void> {
  const existing = await TrainingJobRepo.find(jobId);
  if (!existing) return;
  existing.progress = {
    episodes,
    meanReward: metrics["meanReward"] ?? 0,
    winRate: metrics["winRate"] ?? 0,
    updatedAt: new Date().toISOString(),
  };
  await TrainingJobRepo.set(jobId, existing);
}
