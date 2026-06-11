import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import { deploymentRouter } from "../../src/controllers/deployment.controller.ts";
import { DeploymentRepo, ModelRepo, RatingRepo } from "../../src/repository.ts";
import { ratingKey } from "../../src/models.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * Read-only deployment views for the trainer dashboard. Router-only mount —
 * same pattern as the training controller spec; no Redis anywhere.
 * ------------------------------------------------------------------------- */

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/deployment", deploymentRouter());
  return app;
}

let app: express.Express;
let user0: UserWithId;
let user1: UserWithId;

async function seedModel(owner: UserWithId, displayName: string, artifactRef?: string) {
  const now = new Date().toISOString();
  return ModelRepo.add({
    userId: owner.userId,
    gameKey: "nim",
    displayName,
    sourceRef: "local-training",
    artifactRef,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });
}

async function seedDeployment(
  owner: UserWithId,
  modelId: string,
  status: "active" | "paused" | "retired" = "active",
  createdAt = new Date().toISOString(),
) {
  return DeploymentRepo.add({
    modelId,
    userId: owner.userId,
    gameKey: "nim",
    displayName: "dep",
    status,
    createdAt,
    updatedAt: createdAt,
  });
}

beforeEach(async () => {
  await DeploymentRepo.clear();
  await ModelRepo.clear();
  await RatingRepo.clear();
  app = makeApp();
  user0 = (await getUserByUsername("user0"))!;
  user1 = (await getUserByUsername("user1"))!;
});

describe("GET /api/deployment/list", () => {
  it("returns an empty page when nothing is deployed", async () => {
    const res = await supertest(app).get("/api/deployment/list");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deployments: [], total: 0 });
  });

  it("returns populated views: model name, owner, artifact presence", async () => {
    const modelId = await seedModel(user0, "my-nim-bot", `${"m1"}.pth`);
    await seedDeployment(user0, modelId);

    const res = await supertest(app).get("/api/deployment/list");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);

    const view = res.body.deployments[0];
    expect(view.modelId).toBe(modelId);
    expect(view.modelDisplayName).toBe("my-nim-bot");
    expect(view.owner.username).toBe("user0");
    expect(view.gameKey).toBe("nim");
    expect(view.status).toBe("active");
    expect(view.hasArtifact).toBe(true);
    expect(view.rating).toBeUndefined();
  });

  it("includes the model's real arena rating when one exists", async () => {
    const modelId = await seedModel(user0, "rated-bot");
    await seedDeployment(user0, modelId);
    await RatingRepo.set(ratingKey({ entityType: "ai", entityId: modelId, gameKey: "nim" }), {
      entityId: modelId,
      entityType: "ai",
      gameKey: "nim",
      rating: 1622,
      rd: 120,
      vol: 0.06,
      gamesPlayed: 14,
      lastUpdatedAt: new Date().toISOString(),
    });

    const res = await supertest(app).get("/api/deployment/list");
    const view = res.body.deployments[0];
    expect(view.rating).toEqual({ rating: 1622, gamesPlayed: 14 });
  });

  it("filters by username and sorts newest-first", async () => {
    const mineOld = await seedModel(user0, "old-bot");
    const mineNew = await seedModel(user0, "new-bot");
    const theirs = await seedModel(user1, "their-bot");
    await seedDeployment(user0, mineOld, "active", "2026-06-01T00:00:00.000Z");
    await seedDeployment(user0, mineNew, "paused", "2026-06-02T00:00:00.000Z");
    await seedDeployment(user1, theirs);

    const res = await supertest(app).get("/api/deployment/list?username=user0");
    const body = res.body as { total: number; deployments: { modelDisplayName: string }[] };
    expect(body.total).toBe(2);
    expect(body.deployments.map((d) => d.modelDisplayName)).toEqual(["new-bot", "old-bot"]);
  });

  it("survives deployments whose model or owner records are gone", async () => {
    const modelId = await seedModel(user0, "doomed");
    const depId = await seedDeployment(user0, modelId);

    // Simulate drift: model record vanishes, owner becomes unknown.
    const record = await DeploymentRepo.get(depId);
    record.modelId = "gone-model";
    record.userId = "ghost-user";
    await DeploymentRepo.set(depId, record);

    const res = await supertest(app).get("/api/deployment/list");
    expect(res.status).toBe(200);
    const view = res.body.deployments[0];
    expect(view.modelDisplayName).toBe("unknown model");
    expect(view.owner.username).toBe("unknown");
    expect(view.hasArtifact).toBe(false);
  });
});
