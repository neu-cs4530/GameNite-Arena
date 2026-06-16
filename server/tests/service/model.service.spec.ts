/**
 * Issue #28 — Node-side integration test for the upload → deploy → inference flow.
 *
 * Covers:
 *  - uploadModel: validates game key + adapter version, stores artifact via artifactStore
 *  - deployModel: enforces ownership, CoS 2.7 cap, calls inferenceClient.loadModel
 *  - updateDeploymentStatus: retire calls inferenceClient.unloadModel
 *
 * artifactStore and inferenceClient are stubbed so the suite runs without
 * a real filesystem layout or a live inference service.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as modelService from "../../src/services/model.service.ts";
import * as artifactStore from "../../src/services/artifactStore.service.ts";
import * as inferenceClient from "../../src/services/inferenceClient.ts";
import { ModelRepo, DeploymentRepo, TrainingJobRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

// stubs

vi.mock("../../src/services/artifactStore.service.ts", () => ({
  storeModelArtifact: vi.fn().mockResolvedValue({
    ref: "mock-model-id.pth",
    bytes: 1024,
    sha256: "abc123",
    storedAt: new Date().toISOString(),
  }),
  resolveArtifactRef: vi.fn().mockReturnValue("/models/mock-model-id.pth"),
}));

vi.mock("../../src/services/inferenceClient.ts", () => ({
  loadModel: vi.fn().mockResolvedValue({ status: "loaded" }),
  unloadModel: vi.fn().mockResolvedValue({ status: "unloaded" }),
  requestMove: vi.fn().mockResolvedValue({ move: 1 }),
}));

// fixtures

let testUser: UserWithId;

const validMetadata = {
  game: "nim",
  adapterVersion: "1.0.0",
  trainedAt: Date.now(),
};

beforeEach(async () => {
  await ModelRepo.clear();
  await DeploymentRepo.clear();
  vi.clearAllMocks();
  // Use the seeded fixture user (from tests/setup.ts)
  testUser = (await getUserByUsername("user0"))!;
  // Set INFERENCE_SERVICE_URL so deployModel attempts the inference call in tests.
  process.env["INFERENCE_SERVICE_URL"] = "http://localhost:8001";
  vi.mocked(artifactStore.storeModelArtifact).mockImplementation((modelId: string) =>
    Promise.resolve({
      ref: `${modelId}.pth`,
      bytes: 1024,
      sha256: "abc123",
      storedAt: new Date().toISOString(),
    }),
  );
});

// uploadModel

describe("uploadModel", () => {
  it("creates a model record with artifactRef set", async () => {
    const model = await modelService.uploadModel(
      testUser,
      "/tmp/test.pth",
      "My Nim Model",
      validMetadata,
    );
    expect(model.gameKey).toBe("nim");
    expect(model.displayName).toBe("My Nim Model");
    expect(model.artifactRef).toMatch(/\.pth$/);
    expect(artifactStore.storeModelArtifact).toHaveBeenCalledOnce();
  });

  it("rejects unsupported game keys", async () => {
    await expect(
      modelService.uploadModel(testUser, "/tmp/test.pth", "bad", {
        ...validMetadata,
        game: "chess",
      }),
    ).rejects.toThrow("Unsupported game");
  });

  it("rejects mismatched adapter versions", async () => {
    await expect(
      modelService.uploadModel(testUser, "/tmp/test.pth", "bad", {
        ...validMetadata,
        adapterVersion: "0.9.0",
      }),
    ).rejects.toThrow("Adapter version mismatch");
  });

  it("uses game name as displayName when none provided", async () => {
    const model = await modelService.uploadModel(testUser, "/tmp/test.pth", "", validMetadata);
    expect(model.displayName).toBe("nim-model");
  });
});

// deployModel

describe("deployModel", () => {
  async function uploadAndGetId(): Promise<string> {
    const model = await modelService.uploadModel(
      testUser,
      "/tmp/test.pth",
      "nim model",
      validMetadata,
    );
    return model.modelId;
  }

  it("creates a deployment and calls inferenceClient.loadModel", async () => {
    const modelId = await uploadAndGetId();
    const dep = await modelService.deployModel(testUser, modelId, "live nim");

    expect(dep.status).toBe("active");
    expect(dep.gameKey).toBe("nim");
    expect(inferenceClient.loadModel).toHaveBeenCalledWith({
      deploymentId: dep.deploymentId,
      game: "nim",
      modelId,
    });
  });

  it("rejects deploy for model not owned by user", async () => {
    const modelId = await uploadAndGetId();
    const otherUser: UserWithId = { userId: "non-existent-user", username: "other" };
    await expect(modelService.deployModel(otherUser, modelId)).rejects.toThrow("not own");
  });

  it("rejects deploy for model with no artifact", async () => {
    const now = new Date().toISOString();
    const modelId = await ModelRepo.add({
      userId: testUser.userId,
      gameKey: "nim",
      displayName: "empty",
      sourceRef: "",
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    });
    await expect(modelService.deployModel(testUser, modelId)).rejects.toThrow(
      "no trained artifact",
    );
  });

  it("enforces CoS 2.7 cap of 3 active deployments per game", async () => {
    for (let i = 0; i < 3; i++) {
      const modelId = await uploadAndGetId();
      await modelService.deployModel(testUser, modelId, `dep-${i}`);
    }
    const modelId = await uploadAndGetId();
    await expect(modelService.deployModel(testUser, modelId)).rejects.toThrow("active deployments");
  });

  it("rolls back deployment if inference load fails", async () => {
    const clientError = Object.assign(new Error("bad artifact"), { status: 422 });
    vi.mocked(inferenceClient.loadModel).mockRejectedValueOnce(clientError);
    const modelId = await uploadAndGetId();
    await expect(modelService.deployModel(testUser, modelId)).rejects.toThrow(
      "Inference load failed: bad artifact",
    );
    const keys = await DeploymentRepo.getAllKeys();
    const deps = await Promise.all(keys.map((k) => DeploymentRepo.find(k)));
    expect(deps.every((d) => d?.status !== "active")).toBe(true);
  });
});

// updateDeploymentStatus

describe("updateDeploymentStatus", () => {
  async function uploadAndDeploy() {
    const model = await modelService.uploadModel(testUser, "/tmp/test.pth", "nim", validMetadata);
    return modelService.deployModel(testUser, model.modelId);
  }

  it("calls inferenceClient.unloadModel on retire", async () => {
    const dep = await uploadAndDeploy();
    await modelService.updateDeploymentStatus(dep.deploymentId, testUser, "retired");
    expect(inferenceClient.unloadModel).toHaveBeenCalledWith(dep.deploymentId);
  });

  it("does not call unload when pausing", async () => {
    const dep = await uploadAndDeploy();
    await modelService.updateDeploymentStatus(dep.deploymentId, testUser, "paused");
    expect(inferenceClient.unloadModel).not.toHaveBeenCalled();
  });

  it("rejects status update not owned by user", async () => {
    const dep = await uploadAndDeploy();
    const otherUser: UserWithId = { userId: "non-existent-user", username: "other" };
    await expect(
      modelService.updateDeploymentStatus(dep.deploymentId, otherUser, "retired"),
    ).rejects.toThrow("not own");
  });
});

// getModelById / getModelsByUser

describe("model lookups", () => {
  it("getModelById returns null for an unknown id and the info for a known one", async () => {
    expect(await modelService.getModelById("no-such-model")).toBeNull();

    const created = await modelService.uploadModel(
      testUser,
      "/tmp/test.pth",
      "Lookup",
      validMetadata,
    );
    const found = await modelService.getModelById(created.modelId);
    expect(found).not.toBeNull();
    expect(found!.displayName).toBe("Lookup");
  });

  it("getModelsByUser returns only the user's models, newest first", async () => {
    const other: UserWithId = { userId: "someone-else", username: "other" };
    const mine1 = await modelService.uploadModel(testUser, "/tmp/a.pth", "Old", {
      ...validMetadata,
    });
    const mine2 = await modelService.uploadModel(testUser, "/tmp/b.pth", "New", {
      ...validMetadata,
    });
    // A model the caller does NOT own must be filtered out.
    await ModelRepo.add({
      userId: other.userId,
      gameKey: "nim",
      displayName: "NotMine",
      sourceRef: "",
      visibility: "private",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const models = await modelService.getModelsByUser(testUser.userId);
    expect(models.map((m) => m.modelId).sort()).toEqual([mine1.modelId, mine2.modelId].sort());
    expect(models[0].createdAt.getTime()).toBeGreaterThanOrEqual(models[1].createdAt.getTime());
  });
});

// forkModel

describe("forkModel", () => {
  it("rejects a missing source model", async () => {
    await expect(modelService.forkModel(testUser, "no-such-model")).rejects.toThrow("not found");
  });
});

// deployModel edges

describe("deployModel edges", () => {
  async function uploadAndGetId(): Promise<string> {
    const model = await modelService.uploadModel(testUser, "/tmp/t.pth", "nim", validMetadata);
    return model.modelId;
  }

  it("rejects deploying a model that does not exist", async () => {
    await expect(modelService.deployModel(testUser, "no-such-model")).rejects.toThrow("not found");
  });

  it("skips the inference load when no INFERENCE_SERVICE_URL is configured", async () => {
    delete process.env["INFERENCE_SERVICE_URL"];
    const modelId = await uploadAndGetId();

    const dep = await modelService.deployModel(testUser, modelId);

    expect(dep.status).toBe("active");
    expect(inferenceClient.loadModel).not.toHaveBeenCalled();
  });

  it("proceeds with a warning when the inference service is down (5xx / no status)", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(inferenceClient.loadModel).mockRejectedValueOnce(
      Object.assign(new Error("service melted"), { status: 503 }),
    );
    const modelId = await uploadAndGetId();

    const dep = await modelService.deployModel(testUser, modelId);

    expect(dep.status).toBe("active");
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("unreachable"));
    consoleWarn.mockRestore();
  });

  it("tolerates the deployment record vanishing during a failed-load rollback", async () => {
    const clientError = Object.assign(new Error("bad artifact"), { status: 404 });
    vi.mocked(inferenceClient.loadModel).mockRejectedValueOnce(clientError);
    const modelId = await uploadAndGetId();
    const findSpy = vi.spyOn(DeploymentRepo, "find").mockResolvedValueOnce(null);

    await expect(modelService.deployModel(testUser, modelId)).rejects.toThrow(
      "Inference load failed",
    );
    findSpy.mockRestore();
  });
});

// updateDeploymentStatus edges

describe("updateDeploymentStatus edges", () => {
  async function uploadAndDeploy() {
    const model = await modelService.uploadModel(testUser, "/tmp/t.pth", "nim", validMetadata);
    return modelService.deployModel(testUser, model.modelId);
  }

  it("rejects an unknown deployment id", async () => {
    await expect(
      modelService.updateDeploymentStatus("no-such-dep", testUser, "paused"),
    ).rejects.toThrow("not found");
  });

  it("retires through a 404 from unload (already unloaded)", async () => {
    const dep = await uploadAndDeploy();
    vi.mocked(inferenceClient.unloadModel).mockRejectedValueOnce(
      Object.assign(new Error("gone"), { status: 404 }),
    );
    const updated = await modelService.updateDeploymentStatus(
      dep.deploymentId,
      testUser,
      "retired",
    );
    expect(updated.status).toBe("retired");
  });

  it("retires through a 5xx from unload (service down)", async () => {
    const dep = await uploadAndDeploy();
    vi.mocked(inferenceClient.unloadModel).mockRejectedValueOnce(
      Object.assign(new Error("down"), { status: 502 }),
    );
    const updated = await modelService.updateDeploymentStatus(
      dep.deploymentId,
      testUser,
      "retired",
    );
    expect(updated.status).toBe("retired");
  });

  it("retires through an error carrying no status at all", async () => {
    const dep = await uploadAndDeploy();
    vi.mocked(inferenceClient.unloadModel).mockRejectedValueOnce(new Error("plain failure"));
    const updated = await modelService.updateDeploymentStatus(
      dep.deploymentId,
      testUser,
      "retired",
    );
    expect(updated.status).toBe("retired");
  });

  it("retires through a sub-400 status from unload", async () => {
    const dep = await uploadAndDeploy();
    vi.mocked(inferenceClient.unloadModel).mockRejectedValueOnce(
      Object.assign(new Error("odd redirect"), { status: 302 }),
    );
    const updated = await modelService.updateDeploymentStatus(
      dep.deploymentId,
      testUser,
      "retired",
    );
    expect(updated.status).toBe("retired");
  });

  it("rethrows a real client error from unload", async () => {
    const dep = await uploadAndDeploy();
    vi.mocked(inferenceClient.unloadModel).mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), { status: 403 }),
    );
    await expect(
      modelService.updateDeploymentStatus(dep.deploymentId, testUser, "retired"),
    ).rejects.toThrow("forbidden");
    // The record keeps its previous status when the unload is rejected.
    const record = await DeploymentRepo.get(dep.deploymentId);
    expect(record.status).toBe("active");
  });
});

describe("getModelsByUser — excludes canceled/failed run orphans", () => {
  const now = new Date().toISOString();
  const config = { episodes: 1000, learningRate: 0.0003 };
  const progress = { episodes: 0, meanReward: 0, winRate: 0, updatedAt: now };

  function model(displayName: string, over: Partial<Parameters<typeof ModelRepo.add>[0]> = {}) {
    return ModelRepo.add({
      userId: testUser.userId,
      gameKey: "nim",
      displayName,
      sourceRef: "local-training",
      visibility: "private",
      createdAt: now,
      updatedAt: now,
      ...over,
    });
  }

  it("hides artifact-less models from canceled/failed runs, keeps real models + untrained forks", async () => {
    await TrainingJobRepo.clear();

    const trained = await model("Trained Bot", { artifactRef: "trained.pth" });
    const canceled = await model("Canceled Run");
    await TrainingJobRepo.add({
      modelId: canceled,
      userId: testUser.userId,
      gameKey: "nim",
      config,
      status: "canceled",
      progress,
      checkpoints: [],
      createdAt: now,
    });
    const failed = await model("Failed Run");
    await TrainingJobRepo.add({
      modelId: failed,
      userId: testUser.userId,
      gameKey: "nim",
      config,
      status: "failed",
      progress,
      checkpoints: [],
      createdAt: now,
    });
    const fork = await model("Untrained Fork", { sourceRef: "fork:src" });

    const ids = (await modelService.getModelsByUser(testUser.userId)).map((m) => m.modelId);
    expect(ids).toContain(trained);
    expect(ids).toContain(fork);
    expect(ids).not.toContain(canceled);
    expect(ids).not.toContain(failed);
  });

  it("keeps an artifact-bearing model even if a later re-run was canceled", async () => {
    await TrainingJobRepo.clear();
    const m = await model("Retrained", { artifactRef: "x.pth" });
    await TrainingJobRepo.add({
      modelId: m,
      userId: testUser.userId,
      gameKey: "nim",
      config,
      status: "canceled",
      progress,
      checkpoints: [],
      createdAt: now,
    });
    const ids = (await modelService.getModelsByUser(testUser.userId)).map((m2) => m2.modelId);
    expect(ids).toContain(m);
  });
});
