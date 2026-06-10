import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  TRAINING_PROGRESS_CHANNEL,
  lastEventKey,
  type TrainingProgressEvent,
} from "@gamenite/shared";
import {
  startTrainingSession,
  reportTrainingProgress,
  completeTrainingSession,
  failTrainingSession,
  cancelTrainingSession,
  bindSessionArtifact,
  getSessionArtifactPath,
  getTrainingSession,
  listTrainingSessions,
  setTrainingSessionPublisher,
} from "../../src/services/trainingSession.service.ts";
import { ModelRepo, TrainingJobRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * The global tests/setup.ts reseeds users/games/threads but does NOT clear
 * the Sprint-1 repos, so we clear the ones this suite touches ourselves.
 * The publisher is injected as a fake — no Redis anywhere in this suite; the
 * DB write is the source of truth and publishing is best-effort.
 * ------------------------------------------------------------------------- */

interface PublishedRecord {
  channel: string;
  event: TrainingProgressEvent;
}

function makeFakePublisher() {
  const published: PublishedRecord[] = [];
  const snapshots: Record<string, string> = {};
  return {
    published,
    snapshots,
    client: {
      publish: (channel: string, message: string): Promise<number> => {
        published.push({ channel, event: JSON.parse(message) as TrainingProgressEvent });
        return Promise.resolve(1);
      },
      set: (key: string, value: string, _mode: "EX", _ttl: number): Promise<unknown> => {
        snapshots[key] = value;
        return Promise.resolve("OK");
      },
    },
  };
}

let fake: ReturnType<typeof makeFakePublisher>;
let user0: UserWithId;
let user1: UserWithId;

const nimStart = {
  gameKey: "nim" as const,
  modelDisplayName: "test-nim-bot",
  config: { episodes: 100, learningRate: 0.001 },
};

beforeEach(async () => {
  await TrainingJobRepo.clear();
  await ModelRepo.clear();
  fake = makeFakePublisher();
  setTrainingSessionPublisher(fake.client);
  user0 = (await getUserByUsername("user0"))!;
  user1 = (await getUserByUsername("user1"))!;
});

afterEach(() => {
  setTrainingSessionPublisher(null);
});

describe("startTrainingSession", () => {
  it("creates a queued session and a fresh private model when no modelId is given", async () => {
    const info = await startTrainingSession(user0, nimStart);

    expect(info.status).toBe("queued");
    expect(info.gameKey).toBe("nim");
    expect(info.modelDisplayName).toBe("test-nim-bot");
    expect(info.owner.username).toBe("user0");
    expect(info.hasArtifact).toBe(false);
    expect(info.progress).toMatchObject({ episodes: 0, meanReward: 0, winRate: 0 });
    expect(info.config).toMatchObject({ episodes: 100, learningRate: 0.001 });

    const modelKeys = await ModelRepo.getAllKeys();
    expect(modelKeys).toHaveLength(1);
    const model = await ModelRepo.get(info.modelId);
    expect(model.userId).toBe(user0.userId);
    expect(model.visibility).toBe("private");
    expect(model.artifactRef).toBeUndefined();
  });

  it("defaults the model display name when none is given", async () => {
    const info = await startTrainingSession(user0, {
      gameKey: "connect4",
      config: { episodes: 10, learningRate: 0.1 },
    });
    expect(info.modelDisplayName).toContain("connect4");
  });

  it("publishes a queued progress event keyed to the new job", async () => {
    const info = await startTrainingSession(user0, nimStart);

    expect(fake.published).toHaveLength(1);
    const { channel, event } = fake.published[0];
    expect(channel).toBe(TRAINING_PROGRESS_CHANNEL);
    expect(event.jobId).toBe(info.jobId);
    expect(event.modelId).toBe(info.modelId);
    expect(event.status).toBe("queued");
    expect(event.totalEpochs).toBe(100);
    expect(fake.snapshots[lastEventKey(info.jobId)]).toBeDefined();
  });

  it("reuses an existing owned model", async () => {
    const first = await startTrainingSession(user0, nimStart);
    const second = await startTrainingSession(user0, {
      gameKey: "nim",
      modelId: first.modelId,
      config: { episodes: 50, learningRate: 0.01 },
    });

    expect(second.modelId).toBe(first.modelId);
    expect(await ModelRepo.getAllKeys()).toHaveLength(1);
  });

  it("rejects a modelId that does not exist", async () => {
    await expect(
      startTrainingSession(user0, {
        gameKey: "nim",
        modelId: "no-such-model",
        config: { episodes: 1, learningRate: 0.1 },
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects a model owned by someone else", async () => {
    const theirs = await startTrainingSession(user1, nimStart);
    await expect(
      startTrainingSession(user0, {
        gameKey: "nim",
        modelId: theirs.modelId,
        config: { episodes: 1, learningRate: 0.1 },
      }),
    ).rejects.toThrow(/not own/);
  });

  it("rejects a gameKey that does not match the existing model's game", async () => {
    const first = await startTrainingSession(user0, nimStart);
    await expect(
      startTrainingSession(user0, {
        gameKey: "connect4",
        modelId: first.modelId,
        config: { episodes: 1, learningRate: 0.1 },
      }),
    ).rejects.toThrow(/does not match/);
  });
});

describe("reportTrainingProgress", () => {
  it("flips a queued session to running and records progress", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const info = await reportTrainingProgress(user0, start.jobId, {
      episodes: 50,
      metrics: { meanReward: 0.4, winRate: 0.6, loss: 0.2 },
      message: "halfway",
    });

    expect(info.status).toBe("running");
    expect(info.progress.episodes).toBe(50);
    expect(info.progress.meanReward).toBe(0.4);
    expect(info.progress.winRate).toBe(0.6);
  });

  it("publishes a running event with a clamped progress fraction", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await reportTrainingProgress(user0, start.jobId, {
      episodes: 50,
      metrics: { winRate: 0.6 },
    });

    const event = fake.published.at(-1)!.event;
    expect(event.status).toBe("running");
    expect(event.progress).toBeCloseTo(0.5);
    expect(event.epoch).toBe(50);
    expect(event.totalEpochs).toBe(100);
    expect(event.metrics).toMatchObject({ winRate: 0.6 });

    // Overshooting the target clamps to 1 rather than exceeding it.
    await reportTrainingProgress(user0, start.jobId, { episodes: 500 });
    expect(fake.published.at(-1)!.event.progress).toBe(1);
  });

  it("defaults missing metrics to zero", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const info = await reportTrainingProgress(user0, start.jobId, { episodes: 10 });
    expect(info.progress.meanReward).toBe(0);
    expect(info.progress.winRate).toBe(0);
  });

  it("rejects reports for unknown or foreign sessions", async () => {
    await expect(reportTrainingProgress(user0, "no-such-job", { episodes: 1 })).rejects.toThrow(
      /not found/,
    );

    const theirs = await startTrainingSession(user1, nimStart);
    await expect(reportTrainingProgress(user0, theirs.jobId, { episodes: 1 })).rejects.toThrow(
      /not own/,
    );
  });

  it("returns the canceled session untouched so the local trainer can stop", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await reportTrainingProgress(user0, start.jobId, { episodes: 10 });
    await cancelTrainingSession(user0, start.jobId);
    const publishedBefore = fake.published.length;

    const info = await reportTrainingProgress(user0, start.jobId, { episodes: 20 });

    expect(info.status).toBe("canceled");
    expect(info.progress.episodes).toBe(10); // unchanged
    expect(fake.published.length).toBe(publishedBefore); // nothing published
  });

  it("rejects reports on completed sessions", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await completeTrainingSession(user0, start.jobId, {});
    await expect(reportTrainingProgress(user0, start.jobId, { episodes: 1 })).rejects.toThrow(
      /already/,
    );
  });
});

describe("terminal transitions", () => {
  it("complete marks the session completed and publishes a final event", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await reportTrainingProgress(user0, start.jobId, { episodes: 100 });

    const info = await completeTrainingSession(user0, start.jobId, {
      finalMetrics: { meanReward: 0.7, winRate: 0.9 },
      message: "done",
    });

    expect(info.status).toBe("completed");
    expect(info.completedAt).toBeDefined();
    expect(info.progress.meanReward).toBe(0.7);
    expect(info.progress.winRate).toBe(0.9);

    const event = fake.published.at(-1)!.event;
    expect(event.status).toBe("completed");
    expect(event.progress).toBe(1);
  });

  it("fail marks the session failed with the error and publishes a failed event", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const info = await failTrainingSession(user0, start.jobId, {
      error: "loss diverged",
    });

    expect(info.status).toBe("failed");
    expect(info.error).toBe("loss diverged");
    expect(info.completedAt).toBeDefined();

    const event = fake.published.at(-1)!.event;
    expect(event.status).toBe("failed");
    expect(event.message).toBe("loss diverged");
  });

  it("cancel marks the session canceled and publishes nothing", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const publishedBefore = fake.published.length;

    const info = await cancelTrainingSession(user0, start.jobId);

    expect(info.status).toBe("canceled");
    expect(info.completedAt).toBeDefined();
    expect(fake.published.length).toBe(publishedBefore);
  });

  it("terminal transitions reject sessions that are already terminal", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await completeTrainingSession(user0, start.jobId, {});

    await expect(completeTrainingSession(user0, start.jobId, {})).rejects.toThrow(/already/);
    await expect(failTrainingSession(user0, start.jobId, { error: "x" })).rejects.toThrow(
      /already/,
    );
    await expect(cancelTrainingSession(user0, start.jobId)).rejects.toThrow(/already/);
  });
});

describe("artifacts", () => {
  it("bindSessionArtifact stores the artifact on the model", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const info = await bindSessionArtifact(user0, start.jobId, "/tmp/trained.pth");

    expect(info.hasArtifact).toBe(true);
    const model = await ModelRepo.get(start.modelId);
    expect(model.artifactRef).toBe("/tmp/trained.pth");
    expect(await getSessionArtifactPath(start.jobId)).toBe("/tmp/trained.pth");
  });

  it("only the owner can bind an artifact", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await expect(bindSessionArtifact(user1, start.jobId, "/tmp/evil.pth")).rejects.toThrow(
      /not own/,
    );
  });

  it("getSessionArtifactPath is null before any upload", async () => {
    const start = await startTrainingSession(user0, nimStart);
    expect(await getSessionArtifactPath(start.jobId)).toBeNull();
  });
});

describe("getTrainingSession / listTrainingSessions", () => {
  it("get returns null for unknown ids and the info for known ones", async () => {
    expect(await getTrainingSession("nope")).toBeNull();
    const start = await startTrainingSession(user0, nimStart);
    const info = await getTrainingSession(start.jobId);
    expect(info?.jobId).toBe(start.jobId);
  });

  it("lists newest-first with pagination metadata", async () => {
    const a = await startTrainingSession(user0, nimStart);
    const b = await startTrainingSession(user0, nimStart);
    const c = await startTrainingSession(user0, nimStart);

    // Force a deterministic creation order.
    for (const [jobId, iso] of [
      [a.jobId, "2026-06-01T00:00:00.000Z"],
      [b.jobId, "2026-06-02T00:00:00.000Z"],
      [c.jobId, "2026-06-03T00:00:00.000Z"],
    ] as const) {
      const record = await TrainingJobRepo.get(jobId);
      record.createdAt = iso;
      await TrainingJobRepo.set(jobId, record);
    }

    const page = await listTrainingSessions({});
    expect(page.total).toBe(3);
    expect(page.page).toBe(1);
    expect(page.jobs.map((j) => j.jobId)).toEqual([c.jobId, b.jobId, a.jobId]);

    const paged = await listTrainingSessions({ page: 2, pageSize: 2 });
    expect(paged.jobs).toHaveLength(1);
    expect(paged.jobs[0].jobId).toBe(a.jobId);
    expect(paged.total).toBe(3);
    expect(paged.pageSize).toBe(2);
  });

  it("filters by owner username", async () => {
    await startTrainingSession(user0, nimStart);
    await startTrainingSession(user1, nimStart);

    const page = await listTrainingSessions({ username: "user1" });
    expect(page.total).toBe(1);
    expect(page.jobs[0].owner.username).toBe("user1");
  });
});

describe("publisher resilience", () => {
  it("operations succeed when no publisher is wired", async () => {
    setTrainingSessionPublisher(null);
    const start = await startTrainingSession(user0, nimStart);
    const info = await reportTrainingProgress(user0, start.jobId, { episodes: 5 });
    expect(info.status).toBe("running");
  });

  it("operations succeed when the publisher throws", async () => {
    setTrainingSessionPublisher({
      publish: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
    });
    const start = await startTrainingSession(user0, nimStart);
    expect(start.status).toBe("queued");
  });
});

describe("hardening (review findings)", () => {
  it("a progress write cannot clobber a cancel that landed mid-flight", async () => {
    const start = await startTrainingSession(user0, nimStart);
    await reportTrainingProgress(user0, start.jobId, { episodes: 5 });

    // Simulate the web-UI cancel landing between the progress handler's
    // initial read and its write: the first find() returns the stale running
    // snapshot, the pre-write re-read sees the canceled record.
    const running = await TrainingJobRepo.get(start.jobId);
    const canceled = {
      ...running,
      status: "canceled" as const,
      completedAt: new Date().toISOString(),
    };
    await TrainingJobRepo.set(start.jobId, canceled);
    const findSpy = vi
      .spyOn(TrainingJobRepo, "find")
      .mockResolvedValueOnce({ ...running, progress: { ...running.progress } })
      .mockResolvedValueOnce({ ...canceled, progress: { ...canceled.progress } });

    const info = await reportTrainingProgress(user0, start.jobId, { episodes: 99 });
    findSpy.mockRestore();

    expect(info.status).toBe("canceled");
    const persisted = await TrainingJobRepo.get(start.jobId);
    expect(persisted.status).toBe("canceled");
    expect(persisted.progress.episodes).toBe(5);
  });

  it("list and get survive sessions whose owner record no longer exists", async () => {
    const start = await startTrainingSession(user0, nimStart);
    const record = await TrainingJobRepo.get(start.jobId);
    record.userId = "ghost-user-id";
    await TrainingJobRepo.set(start.jobId, record);

    const info = await getTrainingSession(start.jobId);
    expect(info?.owner).toEqual({ username: "unknown", display: "Unknown user" });

    const page = await listTrainingSessions({});
    expect(page.total).toBe(1);
  });
});
