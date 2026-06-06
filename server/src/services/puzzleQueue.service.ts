import { Queue, Worker } from "bullmq";
import { bullConnection } from "./redis.ts";
import { generateAllDailyPuzzles } from "./puzzle.service.ts";

const PUZZLE_QUEUE_NAME = "puzzle-generation";

// the queue — adding a job just pushes onto Redis
const puzzleQueue = new Queue(PUZZLE_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    // puzzle generation only needs to succeed once per day
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

/**
 * Registers a repeating cron job that fires at midnight UTC every day.
 * Safe to call multiple times — upsertJobScheduler won't create duplicates.
 */
export async function scheduleDailyPuzzleJob(): Promise<void> {
  await puzzleQueue.upsertJobScheduler(
    "daily-puzzle-scheduler",
    { pattern: "0 0 * * *", tz: "UTC" },
    { name: "generate-daily-puzzles", data: {} },
  );
}

/**
 * Starts the worker that processes puzzle generation jobs.
 * Should be called once at server startup, after scheduleDailyPuzzleJob.
 */
export function registerPuzzleWorker(): Worker {
  const worker = new Worker(
    PUZZLE_QUEUE_NAME,
    async () => {
      await generateAllDailyPuzzles();
    },
    { connection: bullConnection, concurrency: 1 },
  );

  /* eslint no-console: "off" */
  worker.on("completed", () => {
    console.log("[puzzle-worker] daily puzzles generated");
  });

  worker.on("failed", (_job, err) => {
    console.error("[puzzle-worker] generation failed:", err.message);
  });

  return worker;
}

// for tests and clean shutdown
export async function closePuzzleQueue(): Promise<void> {
  await puzzleQueue.close();
}
