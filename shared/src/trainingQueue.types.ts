// The contract for what a training job looks like.
// Richard's worker reads this shape, the upload endpoint writes it.
// Lives in shared so both sides use the exact same type.

// one queue, everything training goes through it
export const TRAINING_QUEUE_NAME = "training";

// what gets put on the queue when a job is submitted
export interface TrainingJobData {
  // used as the BullMQ jobId so it's easy to look up
  jobId: string;
  modelId: string;
  userId: string;
  // where the uploaded model lives in object storage
  modelStorageKey: string;
  // training settings from the dashboard config form
  config: {
    epochs: number;
    // no opponent = self-play
    opponentModelId?: string;
    // extra hyperparameters without having to change this type
    hyperparameters?: Record<string, number>;
  };
}

// what the worker returns when a job finishes
export interface TrainingJobResult {
  jobId: string;
  modelId: string;
  // final metrics so the dashboard can show a summary
  finalMetrics: Record<string, number>;
  outputStorageKey: string;
}