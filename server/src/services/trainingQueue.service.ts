/* eslint no-console: "off" */
// The BullMQ training queue.
//   the upload endpoint calls submitTrainingJob() to add work
//   Richard's worker calls registerTrainingWorker() to process it
//   the worker reports progress, which the WebSocket bridge sends to the dashboard
// BullMQ stays contained in this file so the rest of the code only sees plain functions.

import { Queue, Worker, type Job } from "bullmq";
import {
  TRAINING_QUEUE_NAME,
  type TrainingJobData,
  type TrainingJobResult,
} from "@gamenite/shared";
import { bullConnection, createRedisConnection } from "./redis.ts";
import { publishTrainingProgress } from "./trainingPublish.service.ts";

// the queue itself, adding a job just pushes onto Redis
const trainingQueue = new Queue<TrainingJobData, TrainingJobResult>(TRAINING_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    // retry a few times since training can fail on a random issue
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    // clean up finished jobs after a while so Redis doesn't fill up
    removeOnComplete: { age: 3600 },
    // keep failures longer for debugging
    removeOnFail: { age: 24 * 3600 },
  },
});

// the upload endpoint calls this once a model is uploaded and validated.
// passing jobId as the BullMQ job id so the bridge can key progress to it.
export async function submitTrainingJob(data: TrainingJobData): Promise<void> {
  await trainingQueue.add(TRAINING_QUEUE_NAME, data, { jobId: data.jobId });
}

// the function Richard writes to run a job. he gets the data plus a
// reportProgress callback and returns a result
export type TrainingProcessor = (
  data: TrainingJobData,
  reportProgress: (update: {
    progress: number;
    epoch?: number;
    metrics?: Record<string, number>;
    message?: string;
  }) => Promise<void>,
) => Promise<TrainingJobResult>;

// starts the worker that pulls jobs and runs them. called once at startup,
// Richard passes his training logic in as a processor.
export function registerTrainingWorker(
  processor: TrainingProcessor,
): Worker<TrainingJobData, TrainingJobResult> {
  // dedicated connection for progress publishing; can't share the queue's
  const publisherClient = createRedisConnection();

  // worker needs its own connection, can't share the queue's
  const worker = new Worker<TrainingJobData, TrainingJobResult>(
    TRAINING_QUEUE_NAME,
    async (job: Job<TrainingJobData, TrainingJobResult>) => {
      return processor(job.data, async (update) => {
        await job.updateProgress(update.progress);
        await publishTrainingProgress(publisherClient, {
          jobId: job.data.jobId,
          modelId: job.data.modelId,
          status: "running",
          ...update,
        });
      });
    },
    {
      connection: bullConnection,
      // one job at a time, to prevent crashing
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[training-worker] job ${job?.id} failed:`, err.message);
    if (job) {
      void publishTrainingProgress(publisherClient, {
        jobId: job.data.jobId,
        modelId: job.data.modelId,
        status: "failed",
        message: err.message,
      });
    }
  });
  worker.on("completed", (job) => {
    console.log(`[training-worker] job ${job.id} completed`);
    void publishTrainingProgress(publisherClient, {
      jobId: job.data.jobId,
      modelId: job.data.modelId,
      status: "completed",
      progress: 1,
    });
  });

  return worker;
}

// look up a job's state for a status endpoint
export async function getTrainingJob(
  jobId: string,
): Promise<Job<TrainingJobData, TrainingJobResult> | undefined> {
  return trainingQueue.getJob(jobId);
}

// for tests and shutdown
export async function closeTrainingQueue(): Promise<void> {
  await trainingQueue.close();
}
