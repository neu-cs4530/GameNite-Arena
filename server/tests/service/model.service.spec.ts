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
import { ModelRepo, DeploymentRepo } from "../../src/repository.ts";
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
