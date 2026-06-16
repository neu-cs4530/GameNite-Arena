import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertOwnedModel,
  auditTrainingDataIntegrity,
} from "../../src/services/dataIntegrity.service.ts";
import {
  startTrainingSession,
  bindSessionArtifact,
  setTrainingSessionPublisher,
} from "../../src/services/trainingSession.service.ts";
import { issueTrainingToken } from "../../src/services/trainingToken.service.ts";
import {
  DeploymentRepo,
  ModelRepo,
  TrainingJobRepo,
  TrainingTokenRepo,
} from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * Referential integrity for the trainer data web:
 *   user <- model <- training job / deployment / artifact / token.
 * Records are created correctly by the service layer; the audit exists to
 * PROVE the links stay sound (and to catch anything that slips in through
 * a bug, a partial write, or a hand-edited store).
 * ------------------------------------------------------------------------- */

let user0: UserWithId;
let user1: UserWithId;

const nimStart = {
  gameKey: "nim" as const,
  modelDisplayName: "integrity-bot",
  config: { episodes: 10, learningRate: 0.001 },
};

function deploymentRecord(modelId: string, userId: string) {
  const now = new Date().toISOString();
  return {
    modelId,
    userId,
    gameKey: "nim" as const,
    displayName: "dep",
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  await ModelRepo.clear();
  await TrainingJobRepo.clear();
  await DeploymentRepo.clear();
  await TrainingTokenRepo.clear();
  setTrainingSessionPublisher(null);
  user0 = (await getUserByUsername("user0"))!;
  user1 = (await getUserByUsername("user1"))!;
});

describe("assertOwnedModel", () => {
  it("returns the model for its owner", async () => {
    const session = await startTrainingSession(user0, nimStart);
    const model = await assertOwnedModel(user0, session.modelId);
    expect(model.userId).toBe(user0.userId);
  });

  it("rejects unknown models and foreign owners with the standard messages", async () => {
    await expect(assertOwnedModel(user0, "no-such-model")).rejects.toThrow(/not found/);

    const theirs = await startTrainingSession(user1, nimStart);
    await expect(assertOwnedModel(user0, theirs.modelId)).rejects.toThrow(/not own/);
  });
});

describe("auditTrainingDataIntegrity", () => {
  it("reports no violations for a healthy web of records", async () => {
    const session = await startTrainingSession(user0, nimStart);
    const uploaded = path.join(os.tmpdir(), `integrity-${Date.now()}.pth`);
    fs.writeFileSync(uploaded, "weights");
    await bindSessionArtifact(user0, session.jobId, uploaded);
    await DeploymentRepo.add(deploymentRecord(session.modelId, user0.userId));
    await issueTrainingToken(user0);

    const violations = await auditTrainingDataIntegrity();
    expect(violations).toEqual([]);

    const model = await ModelRepo.get(session.modelId);
    fs.unlinkSync(path.join(path.resolve("models"), model.artifactRef!));
  });

  it("flags models whose owner no longer exists", async () => {
    const session = await startTrainingSession(user0, nimStart);
    const model = await ModelRepo.get(session.modelId);
    model.userId = "ghost-user";
    await ModelRepo.set(session.modelId, model);

    const kinds = (await auditTrainingDataIntegrity()).map((v) => v.kind);
    expect(kinds).toContain("model-owner-missing");
  });

  it("flags jobs pointing at missing models and jobs whose owner differs from the model's", async () => {
    const session = await startTrainingSession(user0, nimStart);

    const job = await TrainingJobRepo.get(session.jobId);
    job.modelId = "gone-model";
    await TrainingJobRepo.set(session.jobId, job);
    let kinds = (await auditTrainingDataIntegrity()).map((v) => v.kind);
    expect(kinds).toContain("job-model-missing");

    // Restore the link but cross the owners.
    job.modelId = session.modelId;
    job.userId = user1.userId;
    await TrainingJobRepo.set(session.jobId, job);
    kinds = (await auditTrainingDataIntegrity()).map((v) => v.kind);
    expect(kinds).toContain("job-owner-mismatch");
  });

  it("flags deployments with missing models or crossed owners", async () => {
    const session = await startTrainingSession(user0, nimStart);

    await DeploymentRepo.add(deploymentRecord("gone-model", user0.userId));
    const crossed = await DeploymentRepo.add(deploymentRecord(session.modelId, user1.userId));

    const violations = await auditTrainingDataIntegrity();
    const kinds = violations.map((v) => v.kind);
    expect(kinds).toContain("deployment-model-missing");
    expect(kinds).toContain("deployment-owner-mismatch");
    expect(violations.find((v) => v.kind === "deployment-owner-mismatch")?.recordId).toBe(crossed);
  });

  it("flags artifact refs whose files are gone", async () => {
    const session = await startTrainingSession(user0, nimStart);
    const model = await ModelRepo.get(session.modelId);
    model.artifactRef = `${session.modelId}.pth`; // never stored on disk
    await ModelRepo.set(session.modelId, model);

    const kinds = (await auditTrainingDataIntegrity()).map((v) => v.kind);
    expect(kinds).toContain("artifact-file-missing");
  });

  it("skips a model whose record vanishes between listing keys and reading it", async () => {
    // A key can be listed but read back as null if the record is deleted
    // mid-audit. The audit must skip it (the `if (!model) continue` guard),
    // not crash or report a false violation.
    await startTrainingSession(user0, nimStart);
    const spy = vi.spyOn(ModelRepo, "find").mockResolvedValueOnce(null);

    // The audit must not crash on the missing record; the model is simply
    // skipped, so it produces no model-specific violation of its own.
    const violations = await auditTrainingDataIntegrity();
    expect(violations.some((v) => v.kind === "model-owner-missing")).toBe(false);

    spy.mockRestore();
  });

  it("flags unexpired tokens whose user is gone, ignores expired ones", async () => {
    const live = await issueTrainingToken(user0);
    const liveRecord = await TrainingTokenRepo.get(live.token);
    liveRecord.userId = "ghost-user";
    await TrainingTokenRepo.set(live.token, liveRecord);

    const expired = await issueTrainingToken(user0);
    const expiredRecord = await TrainingTokenRepo.get(expired.token);
    expiredRecord.userId = "another-ghost";
    expiredRecord.expiresAt = new Date(Date.now() - 1000).toISOString();
    await TrainingTokenRepo.set(expired.token, expiredRecord);

    const violations = await auditTrainingDataIntegrity();
    const tokenViolations = violations.filter((v) => v.kind === "token-owner-missing");
    expect(tokenViolations).toHaveLength(1);
    expect(tokenViolations[0].recordId).toBe(live.token);
  });
});
