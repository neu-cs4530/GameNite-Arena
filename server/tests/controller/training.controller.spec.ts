import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as fs from "node:fs";
import type { TrainingSessionInfo } from "@gamenite/shared";
import { trainingRouter } from "../../src/controllers/training.controller.ts";
import { setTrainingSessionPublisher } from "../../src/services/trainingSession.service.ts";
import { ModelRepo, TrainingJobRepo } from "../../src/repository.ts";

/* ---------------------------------------------------------------------------
 * Router-only mount (the full app.ts transitively requires REDIS_URL). The
 * production app mounts the exact same trainingRouter() under /api/training,
 * so these requests exercise the runtime route table.
 *
 * No publisher is injected: every endpoint must work without Redis — the
 * fan-out is best-effort on top of the DB write.
 * ------------------------------------------------------------------------- */
function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/training", trainingRouter());
  return app;
}

const AUTH0 = { username: "user0", password: "pwd0000" };
const AUTH1 = { username: "user1", password: "pwd1111" };
const badAuth = { username: "user0", password: "wrong" };

const startPayload = {
  gameKey: "nim",
  modelDisplayName: "ctrl-spec-bot",
  config: { episodes: 100, learningRate: 0.001 },
};

let app: express.Express;
const UPLOADED_FILES: string[] = [];

async function submitSession(auth = AUTH0, payload = startPayload) {
  const res = await supertest(app).post("/api/training/submit").send({ auth, payload });
  expect(res.status).toBe(201);
  return res.body as TrainingSessionInfo;
}

beforeEach(async () => {
  await TrainingJobRepo.clear();
  await ModelRepo.clear();
  setTrainingSessionPublisher(null);
  app = makeApp();
});

afterEach(() => {
  for (const file of UPLOADED_FILES.splice(0)) {
    try {
      fs.unlinkSync(file);
    } catch {
      // already gone
    }
  }
});

describe("POST /api/training/submit", () => {
  it("registers a session and returns 201 with the session info", async () => {
    const res = await supertest(app)
      .post("/api/training/submit")
      .send({ auth: AUTH0, payload: startPayload });

    expect(res.status).toBe(201);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe("queued");
    expect(res.body.owner.username).toBe("user0");
  });

  it("rejects malformed payloads with 400", async () => {
    const res = await supertest(app)
      .post("/api/training/submit")
      .send({ auth: AUTH0, payload: { gameKey: "nim" } });
    expect(res.status).toBe(400);
  });

  it("rejects unknown game keys with 400", async () => {
    const res = await supertest(app)
      .post("/api/training/submit")
      .send({ auth: AUTH0, payload: { ...startPayload, gameKey: "chess" } });
    expect(res.status).toBe(400);
  });

  it("rejects bad credentials with 403", async () => {
    const res = await supertest(app)
      .post("/api/training/submit")
      .send({ auth: badAuth, payload: startPayload });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/training/list and /:jobId", () => {
  it("lists sessions with pagination metadata", async () => {
    await submitSession();
    await submitSession(AUTH1);

    const res = await supertest(app).get("/api/training/list");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.page).toBe(1);
  });

  it("filters the list by username", async () => {
    await submitSession();
    await submitSession(AUTH1);

    const res = await supertest(app).get("/api/training/list?username=user1");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.jobs[0].owner.username).toBe("user1");
  });

  it("returns a single session by id", async () => {
    const info = await submitSession();
    const res = await supertest(app).get(`/api/training/${info.jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(info.jobId);
  });

  it("404s for unknown job ids", async () => {
    const res = await supertest(app).get("/api/training/no-such-job");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/training/:jobId/progress", () => {
  it("records progress and returns the running session", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/progress`)
      .send({
        auth: AUTH0,
        payload: { episodes: 40, metrics: { winRate: 0.55 }, message: "ep 40" },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
    expect(res.body.progress.episodes).toBe(40);
    expect(res.body.progress.winRate).toBe(0.55);
  });

  it("returns canceled status so the local trainer knows to stop", async () => {
    const info = await submitSession();
    await supertest(app)
      .post(`/api/training/${info.jobId}/cancel`)
      .send({ auth: AUTH0, payload: {} });

    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/progress`)
      .send({ auth: AUTH0, payload: { episodes: 50 } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("canceled");
  });

  it("maps service errors onto HTTP statuses", async () => {
    // unknown -> 404
    const unknown = await supertest(app)
      .post("/api/training/no-such-job/progress")
      .send({ auth: AUTH0, payload: { episodes: 1 } });
    expect(unknown.status).toBe(404);

    // foreign job -> 403
    const info = await submitSession();
    const foreign = await supertest(app)
      .post(`/api/training/${info.jobId}/progress`)
      .send({ auth: AUTH1, payload: { episodes: 1 } });
    expect(foreign.status).toBe(403);

    // terminal -> 409
    await supertest(app)
      .post(`/api/training/${info.jobId}/complete`)
      .send({ auth: AUTH0, payload: {} });
    const terminal = await supertest(app)
      .post(`/api/training/${info.jobId}/progress`)
      .send({ auth: AUTH0, payload: { episodes: 1 } });
    expect(terminal.status).toBe(409);

    // malformed -> 400
    const malformed = await supertest(app)
      .post(`/api/training/${info.jobId}/progress`)
      .send({ auth: AUTH0, payload: { episodes: "lots" } });
    expect(malformed.status).toBe(400);
  });
});

describe("terminal endpoints", () => {
  it("complete returns the completed session", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/complete`)
      .send({ auth: AUTH0, payload: { finalMetrics: { winRate: 0.8 } } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.progress.winRate).toBe(0.8);
  });

  it("fail returns the failed session with its error", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/fail`)
      .send({ auth: AUTH0, payload: { error: "NaN loss" } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
    expect(res.body.error).toBe("NaN loss");
  });

  it("cancel returns the canceled session and double-cancel 409s", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/cancel`)
      .send({ auth: AUTH0, payload: {} });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("canceled");

    const again = await supertest(app)
      .post(`/api/training/${info.jobId}/cancel`)
      .send({ auth: AUTH0, payload: {} });
    expect(again.status).toBe(409);
  });
});

describe("artifact upload / download", () => {
  it("accepts a .pth upload with a JSON-string auth field and binds it", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/artifact`)
      .field("auth", JSON.stringify(AUTH0))
      .attach("file", Buffer.from("fake torch weights"), "trained.pth");

    expect(res.status).toBe(200);
    expect(res.body.hasArtifact).toBe(true);

    const model = await ModelRepo.get(info.modelId);
    expect(model.artifactRef).toBeDefined();
    UPLOADED_FILES.push(model.artifactRef!);
  });

  it("serves the uploaded artifact back", async () => {
    const info = await submitSession();
    await supertest(app)
      .post(`/api/training/${info.jobId}/artifact`)
      .field("auth", JSON.stringify(AUTH0))
      .attach("file", Buffer.from("fake torch weights"), "trained.pth");
    const model = await ModelRepo.get(info.modelId);
    UPLOADED_FILES.push(model.artifactRef!);

    const res = await supertest(app)
      .get(`/api/training/${info.jobId}/artifact`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString()).toBe("fake torch weights");
  });

  it("404s when no artifact has been uploaded", async () => {
    const info = await submitSession();
    const res = await supertest(app).get(`/api/training/${info.jobId}/artifact`);
    expect(res.status).toBe(404);
  });

  it("rejects non-.pth files", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/artifact`)
      .field("auth", JSON.stringify(AUTH0))
      .attach("file", Buffer.from("#!/bin/sh"), "malware.sh");
    expect(res.status).toBe(400);
  });

  it("rejects bad credentials with 403 and does not bind the file", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/artifact`)
      .field("auth", JSON.stringify(badAuth))
      .attach("file", Buffer.from("nope"), "trained.pth");

    expect(res.status).toBe(403);
    const model = await ModelRepo.get(info.modelId);
    expect(model.artifactRef).toBeUndefined();
  });

  it("rejects a missing or unparsable auth field with 400", async () => {
    const info = await submitSession();
    const res = await supertest(app)
      .post(`/api/training/${info.jobId}/artifact`)
      .field("auth", "not json")
      .attach("file", Buffer.from("nope"), "trained.pth");
    expect(res.status).toBe(400);
  });
});
