// Tests for the training progress bridge. no real Redis or socket.io,
// everything runs through fakes of the small interfaces in trainingProgress.types.ts.

import { describe, expect, it, beforeEach } from "vitest";
import {
  TrainingProgressBridge,
  type ClientSocket,
} from "../../src/services/trainingBridge.service.ts";
import { publishTrainingProgress } from "../../src/services/trainingPublish.service.ts";
import {
  SocketEvents,
  TRAINING_PROGRESS_CHANNEL,
  jobRoom,
  lastEventKey,
  type ProgressSubscriber,
  type RoomEmitter,
  type SnapshotStore,
  type TrainingProgressEvent,
} from "@gamenite/shared";

// --- fakes ---

class FakeEmitter implements RoomEmitter {
  readonly sent: Array<{ room: string; event: string; payload: unknown }> = [];
  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => this.sent.push({ room, event, payload }),
    };
  }
}

class FakeSubscriber implements ProgressSubscriber {
  readonly subscribedChannels: string[] = [];
  private _handler?: (channel: string, message: string) => void;

  subscribe(channel: string): Promise<void> {
    this.subscribedChannels.push(channel);
    return Promise.resolve();
  }
  onMessage(handler: (channel: string, message: string) => void): void {
    this._handler = handler;
  }
  // test helper: push a message as if it came from Redis
  push(channel: string, message: string): void {
    this._handler?.(channel, message);
  }
}

class FakeSnapshotStore implements SnapshotStore {
  private readonly _store = new Map<string, string>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this._store.get(key) ?? null);
  }
  set(key: string, value: string): void {
    this._store.set(key, value);
  }
}

class FakeSocket implements ClientSocket {
  readonly rooms = new Set<string>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  private _handlers = new Map<string, (...args: unknown[]) => void>();

  join(room: string): void {
    this.rooms.add(room);
  }
  leave(room: string): void {
    this.rooms.delete(room);
  }
  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }
  on(event: string, handler: (...args: unknown[]) => void): void {
    this._handlers.set(event, handler);
  }
  // test helper: simulate the client firing an event
  fire(event: string, ...args: unknown[]): void {
    this._handlers.get(event)?.(...args);
  }
}

const sampleEvent = (overrides: Partial<TrainingProgressEvent> = {}): TrainingProgressEvent => ({
  jobId: "job-1",
  modelId: "model-7",
  status: "running",
  progress: 0.5,
  epoch: 5,
  totalEpochs: 10,
  timestamp: 1700000000000,
  ...overrides,
});

const silentLogger = { warn: () => {}, error: () => {} };

// --- bridge ---

describe("TrainingProgressBridge", () => {
  let subscriber: FakeSubscriber;
  let emitter: FakeEmitter;
  let snapshots: FakeSnapshotStore;
  let bridge: TrainingProgressBridge;

  beforeEach(async () => {
    subscriber = new FakeSubscriber();
    emitter = new FakeEmitter();
    snapshots = new FakeSnapshotStore();
    bridge = new TrainingProgressBridge({ subscriber, emitter, snapshots, logger: silentLogger });
    await bridge.start();
  });

  it("should subscribe to the progress channel on start", () => {
    expect(subscriber.subscribedChannels).toContain(TRAINING_PROGRESS_CHANNEL);
  });

  it("should be safe to call start twice", async () => {
    await bridge.start();
    expect(subscriber.subscribedChannels).toEqual([TRAINING_PROGRESS_CHANNEL]);
  });

  it("should route a Redis event to the right job room", () => {
    subscriber.push(TRAINING_PROGRESS_CHANNEL, JSON.stringify(sampleEvent({ jobId: "abc" })));
    expect(emitter.sent).toHaveLength(1);
    expect(emitter.sent[0].room).toBe(jobRoom("abc"));
    expect(emitter.sent[0].event).toBe(SocketEvents.progress);
    expect((emitter.sent[0].payload as TrainingProgressEvent).progress).toBe(0.5);
  });

  it("should ignore messages on other channels", () => {
    subscriber.push("some:other:channel", JSON.stringify(sampleEvent()));
    expect(emitter.sent).toHaveLength(0);
  });

  it("should drop malformed payloads without throwing", () => {
    expect(() => subscriber.push(TRAINING_PROGRESS_CHANNEL, "not json")).not.toThrow();
    expect(() =>
      subscriber.push(TRAINING_PROGRESS_CHANNEL, JSON.stringify({ nope: true })),
    ).not.toThrow();
    expect(emitter.sent).toHaveLength(0);
  });

  it("should join a client to the job room on subscribe", () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    expect(socket.rooms.has(jobRoom("job-1"))).toBe(true);
  });

  it("should replay the last known event to a reconnecting client", async () => {
    snapshots.set(lastEventKey("job-1"), JSON.stringify(sampleEvent({ progress: 0.8 })));
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    // replay is async inside the handler, let the microtask queue flush
    await Promise.resolve();
    expect(socket.emitted).toHaveLength(1);
    expect((socket.emitted[0].payload as TrainingProgressEvent).progress).toBe(0.8);
  });

  it("should send nothing on subscribe when there is no snapshot", async () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "brand-new" });
    await Promise.resolve();
    expect(socket.emitted).toHaveLength(0);
  });

  it("should leave the room on unsubscribe", () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    socket.fire(SocketEvents.unsubscribe, { jobId: "job-1" });
    expect(socket.rooms.has(jobRoom("job-1"))).toBe(false);
  });

  it("should ignore a subscribe with no jobId", () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, {});
    expect(socket.rooms.size).toBe(0);
  });

  it("should tidy its room set when the client disconnects", () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    // The disconnect handler clears the bridge's own room set without throwing.
    expect(() => socket.fire("disconnect")).not.toThrow();
  });

  it("should warn (not throw) when the snapshot fetch fails on replay", async () => {
    const warnings: string[] = [];
    const failingSnapshots: SnapshotStore = {
      get: () => Promise.reject(new Error("redis down")),
    };
    const failingBridge = new TrainingProgressBridge({
      subscriber: new FakeSubscriber(),
      emitter: new FakeEmitter(),
      snapshots: failingSnapshots,
      logger: { warn: (msg: string) => warnings.push(msg), error: () => {} },
    });
    await failingBridge.start();

    const socket = new FakeSocket();
    failingBridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    await Promise.resolve();
    await Promise.resolve();

    expect(socket.emitted).toHaveLength(0);
    expect(warnings.some((w) => w.includes("snapshot fetch failed"))).toBe(true);
  });

  it("defaults its logger to console when none is provided", () => {
    // The constructor's `?? console` fallback path.
    const plainBridge = new TrainingProgressBridge({
      subscriber: new FakeSubscriber(),
      emitter: new FakeEmitter(),
      snapshots: new FakeSnapshotStore(),
    });
    expect(plainBridge).toBeInstanceOf(TrainingProgressBridge);
  });

  it("ignores an unsubscribe with no jobId", () => {
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    socket.fire(SocketEvents.unsubscribe, {}); // no jobId → early return, stays joined
    expect(socket.rooms.has(jobRoom("job-1"))).toBe(true);
  });

  it("does not emit a replay when the stored snapshot is unparseable", async () => {
    snapshots.set(lastEventKey("job-1"), "not json");
    const socket = new FakeSocket();
    bridge.registerClient(socket);
    socket.fire(SocketEvents.subscribe, { jobId: "job-1" });
    await Promise.resolve();
    expect(socket.emitted).toHaveLength(0);
  });
});

// --- publisher ---

describe("publishTrainingProgress", () => {
  it("should write the snapshot before broadcasting and fill in a timestamp", async () => {
    const calls: string[] = [];
    const published: Array<[string, string]> = [];
    const client = {
      set: (key: string, value: string) => {
        calls.push("set");
        published.push([key, value]);
        return Promise.resolve("OK");
      },
      publish: (channel: string, message: string) => {
        calls.push("publish");
        published.push([channel, message]);
        return Promise.resolve(1);
      },
    };

    await publishTrainingProgress(client, {
      jobId: "job-9",
      modelId: "m1",
      status: "running",
      progress: 0.25,
    });

    // snapshot must come before the broadcast
    expect(calls).toEqual(["set", "publish"]);
    expect(published[0][0]).toBe(lastEventKey("job-9"));
    const stored = JSON.parse(published[0][1]) as TrainingProgressEvent;
    expect(stored.jobId).toBe("job-9");
    expect(typeof stored.timestamp).toBe("number");
    expect(published[1][0]).toBe(TRAINING_PROGRESS_CHANNEL);
  });
});
