/**
 * server/src/services/trainingWorker.ts
 *
 * Register at startup in server.ts:
 *   import { trainingProcessor } from "./services/trainingWorker.ts";
 *   import { registerTrainingWorker } from "./services/trainingQueue.service.ts";
 *   registerTrainingWorker(trainingProcessor);  // inside httpServer.listen callback
 *
 * SANDBOX APPROACH (Render-constrained):
 *   Render does NOT allow spawning Docker containers at runtime (no docker
 *   daemon access inside a service, no docker-compose). So "one container per
 *   training job" is not possible. Instead:
 *     - this worker is deployed as its own Render Background Worker service,
 *       built from a Dockerfile that pins python/torch/SB3 (service-level
 *       isolation from the main web/API service);
 *     - each job runs as a CHILD PROCESS with guardrails: a hard wall-clock
 *       timeout that kills the whole process group, a scratch temp dir, and an
 *       AST scan + resource limits applied inside run_training.py (CPU/mem/fsize
 *       via the `resource` module). See run_training.py.
 *   Residual gap: without privileged access we cannot fully network-isolate the
 *   child on Render; outbound network is mitigated by the AST scan, not blocked.
 *   Documented as a known limitation in the final report.
 *
 * STORAGE: POST-DEMO — wire to artifactStore.service.ts (local filesystem,
 * matching Zach's canonical <modelId>.pth layout) when server-side training
 * is enabled. objectStorage/R2 approach was removed; local disk is shared.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TrainingJobData, TrainingJobResult } from "@gamenite/shared";
import type { TrainingProcessor } from "./trainingQueue.service.ts";
import { ModelRepo, TrainingJobRepo } from "../repository.ts";

// Hard ceiling for a single training job. Kills the process group on expiry.
const TRAINING_TIMEOUT_MS = Number(process.env["TRAINING_TIMEOUT_MS"] ?? 10 * 60_000);

// Absolute path to the platform training entrypoint (run_training.py), bundled
// into this worker's image alongside base_adapter.py. NOT relative to the
// per-job temp dir — it is fixed platform code, not user code.
const RUN_TRAINING_SCRIPT =
  process.env["RUN_TRAINING_SCRIPT"] ?? path.resolve("ai/inference-service/run_training.py");

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

  // Per-job scratch dir on the worker's local disk (ephemeral, fine for scratch).
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `train-${modelId}-`));
  const localAdapter = path.join(workDir, "adapter.py");
  const localOutput = path.join(workDir, "trained.pth");
  const outputKey = `trained-${modelId}-${Date.now()}.pth`;

  try {
    // 1. TODO(post-demo): copy adapter from local artifact store to scratch dir.
    // await artifactStore.resolveArtifactRef(data.modelStorageKey) -> copy to localAdapter
    // For now this path is not exercised (training is local, not server-side).

    // 2. Train (guarded subprocess). Captures final metrics from the last line.
    const finalMetrics = await runTrainingSubprocess(
      localAdapter,
      localOutput,
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

    // 3. TODO(post-demo): store artifact via artifactStore.storeModelArtifact(modelId, localOutput).

    // 4. Point the model record at the object key (NOT a local path).
    const model = await ModelRepo.find(modelId);
    if (model) {
      model.artifactRef = outputKey;
      model.updatedAt = new Date().toISOString();
      await ModelRepo.set(modelId, model);
    }

    await updateJobStatus(jobId, "completed");
    await reportProgress({ progress: 1, message: "Training complete" });

    return {
      jobId,
      modelId,
      finalMetrics,
      outputStorageKey: outputKey,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown training error";
    await updateJobStatus(jobId, "failed", message);
    throw err;
  } finally {
    // Always clean up scratch, even on failure/timeout.
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

// Subprocess runner

/**
 * Runs the adapter training script as a guarded Python subprocess.
 *
 * run_training.py is expected to:
 *   - AST-scan the adapter and reject dangerous imports before importing it,
 *   - apply resource limits (RLIMIT_CPU / RLIMIT_AS / RLIMIT_FSIZE / RLIMIT_NPROC),
 *   - print JSON progress lines to stdout:
 *       {"epoch": 10, "loss": 0.42, "winRate": 0.61, "meanReward": 0.3}
 *   - exit 0 on success having written the .pth to --output.
 *
 * Resolves with the metrics from the LAST progress line seen.
 */
async function runTrainingSubprocess(
  adapterPath: string,
  outputPath: string,
  config: TrainingJobData["config"],
  onProgress: (epoch: number, metrics: Record<string, number>) => Promise<void>,
): Promise<{ loss: number; winRate: number; meanReward: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      RUN_TRAINING_SCRIPT,
      adapterPath,
      "--output",
      outputPath,
      "--epochs",
      String(config.epochs),
    ];
    if (config.hyperparameters) {
      args.push("--hyperparameters", JSON.stringify(config.hyperparameters));
    }

    // detached:true puts the child in its own process group so a timeout can
    // kill the child AND any grandchildren it spawned (kill(-pid)).
    const proc = spawn("python3", args, { detached: true });
    let stderr = "";
    let lastMetrics = { loss: 0, winRate: 0, meanReward: 0 };
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (proc.pid) process.kill(-proc.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, TRAINING_TIMEOUT_MS);

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
            const metrics = {
              loss: parsed.loss ?? 0,
              winRate: parsed.winRate ?? 0,
              meanReward: parsed.meanReward ?? 0,
            };
            lastMetrics = metrics;
            void onProgress(parsed.epoch, metrics);
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
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Training exceeded ${TRAINING_TIMEOUT_MS}ms and was killed`));
      } else if (code === 0) {
        resolve(lastMetrics);
      } else {
        reject(new Error(`Training subprocess exited with code ${code}:\n${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
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
