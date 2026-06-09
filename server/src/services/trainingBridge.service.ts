// WebSocket bridge for training progress.
//   worker -> publish -> Redis channel -> [this bridge] -> socket room -> dashboard
// the worker runs in a separate flow and can't hold socket connections, so Redis
// pub/sub sits in the middle. per-job rooms keep fan-out cheap.

import {
  SOCKET_EVENTS,
  TRAINING_PROGRESS_CHANNEL,
  jobRoom,
  lastEventKey,
  type ProgressSubscriber,
  type RoomEmitter,
  type SnapshotStore,
  type TrainingProgressEvent,
} from "@gamenite/shared";

// the bit of a socket.io Socket we actually use, narrow so tests don't need a real server
export interface ClientSocket {
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export interface BridgeDependencies {
  subscriber: ProgressSubscriber;
  emitter: RoomEmitter;
  snapshots: SnapshotStore;
  // swap for the team logger in prod, defaults to console
  logger?: Pick<Console, "warn" | "error">;
}

export class TrainingProgressBridge {
  private readonly _subscriber: ProgressSubscriber;
  private readonly _emitter: RoomEmitter;
  private readonly _snapshots: SnapshotStore;
  private readonly _logger: Pick<Console, "warn" | "error">;
  private _started = false;

  constructor(deps: BridgeDependencies) {
    this._subscriber = deps.subscriber;
    this._emitter = deps.emitter;
    this._snapshots = deps.snapshots;
    this._logger = deps.logger ?? console;
  }

  // wire up the Redis subscription. call once at startup.
  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    this._subscriber.onMessage((channel, message) => {
      if (channel !== TRAINING_PROGRESS_CHANNEL) return;
      const event = this._parseEvent(message);
      if (!event) return;
      this._emitter.to(jobRoom(event.jobId)).emit(SOCKET_EVENTS.progress, event);
    });

    await this._subscriber.subscribe(TRAINING_PROGRESS_CHANNEL);
  }

  // set up a newly connected client. call from the socket.io connection handler.
  registerClient(socket: ClientSocket): void {
    const joinedRooms = new Set<string>();

    socket.on(SOCKET_EVENTS.subscribe, (payload) => {
      const jobId = (payload as { jobId?: string })?.jobId;
      if (!jobId) {
        this._logger.warn("[training-bridge] subscribe with no jobId, ignoring");
        return;
      }
      socket.join(jobRoom(jobId));
      joinedRooms.add(jobRoom(jobId));
      // catch the client up with the last event so the dashboard isn't blank
      void this._replayLastEvent(socket, jobId);
    });

    socket.on(SOCKET_EVENTS.unsubscribe, (payload) => {
      const jobId = (payload as { jobId?: string })?.jobId;
      if (!jobId) return;
      socket.leave(jobRoom(jobId));
      joinedRooms.delete(jobRoom(jobId));
    });

    socket.on("disconnect", () => {
      // socket.io clears rooms on disconnect, we just tidy our own set
      joinedRooms.clear();
    });
  }

  private async _replayLastEvent(socket: ClientSocket, jobId: string): Promise<void> {
    try {
      const raw = await this._snapshots.get(lastEventKey(jobId));
      if (!raw) return;
      const event = this._parseEvent(raw);
      if (event) socket.emit(SOCKET_EVENTS.progress, event);
    } catch (err) {
      this._logger.warn(`[training-bridge] snapshot fetch failed for ${jobId}: ${String(err)}`);
    }
  }

  private _parseEvent(message: string): TrainingProgressEvent | null {
    try {
      const obj = JSON.parse(message) as Partial<TrainingProgressEvent>;
      if (typeof obj.jobId === "string" && typeof obj.status === "string") {
        return obj as TrainingProgressEvent;
      }
      this._logger.warn("[training-bridge] dropping event missing jobId or status");
      return null;
    } catch {
      this._logger.error("[training-bridge] received non-JSON payload");
      return null;
    }
  }
}
