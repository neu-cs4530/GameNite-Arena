// Publisher helper for training progress.
// The worker calls this (via the reportProgress callback) to emit progress.
// Keeps the worker from building raw Redis payloads so the contract can't drift.

import {
  TRAINING_PROGRESS_CHANNEL,
  lastEventKey,
  type TrainingProgressEvent,
} from "@gamenite/shared";

// the bit of a Redis client we need. ioredis satisfies this.
export interface ProgressPublisherClient {
  publish(channel: string, message: string): Promise<number>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
}

// how long the last-event snapshot sticks around. a job won't outlive this.
const SNAPSHOT_TTL_SECONDS = 60 * 60; // 1 hour

// publish one progress event. stores it as the job's snapshot first, then
// broadcasts. snapshot first so a reconnecting client is never behind the broadcast.
export async function publishTrainingProgress(
  client: ProgressPublisherClient,
  event: Omit<TrainingProgressEvent, "timestamp"> & { timestamp?: number },
): Promise<void> {
  const fullEvent: TrainingProgressEvent = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  };
  const payload = JSON.stringify(fullEvent);

  await client.set(lastEventKey(fullEvent.jobId), payload, "EX", SNAPSHOT_TTL_SECONDS);
  await client.publish(TRAINING_PROGRESS_CHANNEL, payload);
}
