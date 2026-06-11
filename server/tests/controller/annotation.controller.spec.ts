import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as annotation from "../../src/controllers/annotation.controller.ts";
import { AnnotationRepo } from "../../src/repository.ts";

/* ---------------------------------------------------------------------------
 * We mount only the annotation router (not the full `app`, which transitively
 * pulls in Redis-dependent services that won't init without REDIS_URL).
 * This exercises the same Router config as production server/src/app.ts.
 * ----------------------------------------------------------------------- */
function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/annotation",
    express.Router().post("/create", annotation.postCreate).get("/:id", annotation.getById),
  );
  return app;
}

// setup.ts reseeds the user repo (user0/pwd0000 ...) before each test, so we
// can authenticate as a seeded user without standing up the full app.
const auth = { username: "user0", password: "pwd0000" };

beforeEach(async () => {
  // resetEverythingToDefaults doesn't touch the annotation repo; clear it so
  // annotations can't bleed between tests.
  await AnnotationRepo.clear();
});

describe("POST /api/annotation/create", () => {
  it("creates an annotation and returns it with an id (200)", async () => {
    const res = await supertest(makeApp())
      .post("/api/annotation/create")
      .send({ auth, payload: { matchId: "m-1", moveIndex: 3, text: "great move" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      matchId: "m-1",
      moveIndex: 3,
      text: "great move",
      visibility: "private",
    });
    expect(typeof res.body.annotationId).toBe("string");
    expect(typeof res.body.authorId).toBe("string");
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("returns 400 for a poorly-formed body (missing moveIndex)", async () => {
    const res = await supertest(makeApp())
      .post("/api/annotation/create")
      .send({ auth, payload: { matchId: "m-1", text: "no move index" } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/annotation/create")
      .send({
        auth: { username: "user0", password: "wrong" },
        payload: { matchId: "m-1", moveIndex: 0, text: "x" },
      });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/annotation/:id", () => {
  it("retrieves a previously created annotation (200)", async () => {
    const created = await supertest(makeApp())
      .post("/api/annotation/create")
      .send({ auth, payload: { matchId: "m-2", moveIndex: 1, text: "blunder", marker: "bad" } });
    const { annotationId } = created.body as { annotationId: string };

    const res = await supertest(makeApp()).get(`/api/annotation/${annotationId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      annotationId,
      matchId: "m-2",
      moveIndex: 1,
      text: "blunder",
      marker: "bad",
    });
  });

  it("returns 404 for an unknown annotation id", async () => {
    const res = await supertest(makeApp()).get("/api/annotation/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
