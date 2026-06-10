// The contract for live training progress events.
// The worker publishes these, the bridge fans them out, the dashboard reads them.
// Lives in shared so all three sides use the exact same shape.

export type TrainingStatus = "queued" | "running" | "completed" | "failed";

export interface TrainingProgressEvent {
  jobId: string;
  modelId: string;
  status: TrainingStatus;
  // 0..1 for the dashboard progress bar, optional on a queued event
  progress?: number;
  epoch?: number;
  totalEpochs?: number;
  // open bag so the worker can report loss/winRate/etc without changing this type
  metrics?: Record<string, number>;
  message?: string;
  // epoch ms, lets the client order events
  timestamp: number;
}

export const TRAINING_PROGRESS_CHANNEL = "training:progress";

// socket.io room for one job; clients watching that job join it
export const jobRoom = (jobId: string): string => `training:job:${jobId}`;

// Redis key holding the last event for a job, used to catch up reconnecting clients
export const lastEventKey = (jobId: string): string => `training:progress:last:${jobId}`;

export const SocketEvents = {
  // client -> server: start sending me updates for this job
  subscribe: "training:subscribe",
  // client -> server: stop sending me updates
  unsubscribe: "training:unsubscribe",
  // server -> client: a progress update
  progress: "training:progress",
} as const;

// --- small interfaces so the bridge doesn't depend on ioredis/socket.io directly ---
// these are what keep the bridge unit testable; real versions live in the adapter.

export interface ProgressSubscriber {
  subscribe(channel: string): Promise<void>;
  onMessage(handler: (channel: string, message: string) => void): void;
}

export interface SnapshotStore {
  get(key: string): Promise<string | null>;
}

export interface RoomEmitter {
  to(room: string): { emit(event: string, payload: unknown): void };
}
