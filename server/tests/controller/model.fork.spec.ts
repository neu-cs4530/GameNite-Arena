import { beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.ts";
import { ModelRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";

/* ---------------------------------------------------------------------------
 * POST /api/model/:modelId/fork (Story 2.13): copies a visible model into a
 * NEW record owned by the caller — gameKey carried over, no trained
 * artifact, sourceRef pointing back at the source. Visibility parity with
 * GET /api/model/:id: any model that endpoint returns can be forked.
 * ------------------------------------------------------------------------- */

const auth0 = { username: "user0", password: "pwd0000" };
const authBad = { username: "user0", password: "nope" };

async function seedModel(args: {
  ownerUsername: string;
  displayName?: string;
  visibility?: "private" | "public";
}): Promise<string> {
  const owner = (await getUserByUsername(args.ownerUsername))!;
  const now = "2026-06-01T00:00:00.000Z";
  return ModelRepo.add({
    userId: owner.userId,
    gameKey: "nim",
    displayName: args.displayName ?? "SourceBot",
    sourceRef: "uploads/source.py",
    artifactRef: "source.pth",
    artifactMeta: { bytes: 2048, sha256: "abc123", uploadedAt: now },
    visibility: args.visibility ?? "private",
    createdAt: now,
    updatedAt: now,
  });
}

beforeEach(async () => {
  await ModelRepo.clear();
});

describe("POST /api/model/:modelId/fork", () => {
  it("returns 400 on a malformed payload", async () => {
    const modelId = await seedModel({ ownerUsername: "user0" });

    const wrongShape = await supertest(app)
      .post(`/api/model/${modelId}/fork`)
      .send({ auth: auth0, payload: { displayName: 9 } });
    expect(wrongShape.status).toBe(400);

    const tooLong = await supertest(app)
      .post(`/api/model/${modelId}/fork`)
      .send({ auth: auth0, payload: { displayName: "x".repeat(121) } });
    expect(tooLong.status).toBe(400);
  });

  it("returns 403 with bad credentials", async () => {
    const modelId = await seedModel({ ownerUsername: "user0" });
    const response = await supertest(app)
      .post(`/api/model/${modelId}/fork`)
      .send({ auth: authBad, payload: {} });
    expect(response.status).toBe(403);
  });

  it("returns 404 when the source model does not exist", async () => {
    const response = await supertest(app)
      .post(`/api/model/${randomUUID().toString()}/fork`)
      .send({ auth: auth0, payload: {} });
    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/);
  });

  it("creates a fresh private model owned by the caller (201, ModelInfo shape)", async () => {
    const sourceId = await seedModel({ ownerUsername: "user0", displayName: "My Champion" });

    const response = await supertest(app)
      .post(`/api/model/${sourceId}/fork`)
      .send({ auth: auth0, payload: {} });

    expect(response.status).toBe(201);
    expect(response.body).toStrictEqual({
      modelId: expect.any(String),
      owner: {
        username: "user0",
        display: "The Knight Of Games",
        createdAt: expect.any(String),
      },
      gameKey: "nim",
      displayName: "Fork of My Champion",
      visibility: "private",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(response.body.modelId).not.toBe(sourceId);

    // The stored record references the source and carries NO artifact.
    const record = await ModelRepo.get(response.body.modelId as string);
    expect(record.sourceRef).toBe(`fork:${sourceId}`);
    expect(record.forkedFrom).toBe(sourceId);
    expect(record.artifactRef).toBeUndefined();
    expect(record.artifactMeta).toBeUndefined();

    // The source is untouched.
    const source = await ModelRepo.get(sourceId);
    expect(source.displayName).toBe("My Champion");
    expect(source.artifactRef).toBe("source.pth");
  });

  it("honors a custom display name", async () => {
    const sourceId = await seedModel({ ownerUsername: "user0" });

    const response = await supertest(app)
      .post(`/api/model/${sourceId}/fork`)
      .send({ auth: auth0, payload: { displayName: "Remix" } });

    expect(response.status).toBe(201);
    expect(response.body.displayName).toBe("Remix");
  });

  it("lets a caller fork another user's model (same visibility as get-by-id)", async () => {
    const sourceId = await seedModel({ ownerUsername: "user1", visibility: "public" });

    const response = await supertest(app)
      .post(`/api/model/${sourceId}/fork`)
      .send({ auth: auth0, payload: {} });

    expect(response.status).toBe(201);
    // The FORK belongs to the caller, not the source owner.
    expect(response.body.owner.username).toBe("user0");
    const record = await ModelRepo.get(response.body.modelId as string);
    const user0 = (await getUserByUsername("user0"))!;
    expect(record.userId).toBe(user0.userId);
  });
});
