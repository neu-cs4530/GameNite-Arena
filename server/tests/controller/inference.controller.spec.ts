import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getArtifact, inferenceRouter } from "../../src/controllers/inference.controller.ts";
import { ARTIFACT_ROOT, artifactRefForModel } from "../../src/services/artifactStore.service.ts";

/* ---------------------------------------------------------------------------
 * The self-hosted Python inference box pulls model artifacts from Render over
 * GET /api/inference/artifact/:modelId. The endpoint is NOT user body-auth; it
 * is gated by a SHARED bearer token (INFERENCE_SHARED_TOKEN). It streams the
 * canonical <modelId>.pth resolved through the artifact store (so it inherits
 * the store's path-traversal rejection), and FAILS CLOSED (503) when the token
 * is not configured — it must never allow-all.
 * ------------------------------------------------------------------------- */

const TOKEN = "test-shared-token-abc123";
const STORED_MODEL = `selfhost-spec-${Date.now()}`;
const STORED_BYTES = "fake torch weights for the box";
const CLEANUP_PATHS: string[] = [];

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/inference", inferenceRouter());
  return app;
}

function seedArtifact(modelId: string, content: string): void {
  if (!fs.existsSync(ARTIFACT_ROOT)) fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  const target = path.join(ARTIFACT_ROOT, artifactRefForModel(modelId));
  fs.writeFileSync(target, content);
  CLEANUP_PATHS.push(target);
}

let app: express.Express;

beforeEach(() => {
  process.env["INFERENCE_SHARED_TOKEN"] = TOKEN;
  seedArtifact(STORED_MODEL, STORED_BYTES);
  app = makeApp();
});

afterEach(() => {
  delete process.env["INFERENCE_SHARED_TOKEN"];
  for (const p of CLEANUP_PATHS.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {
      // already gone
    }
  }
});

describe("GET /api/inference/artifact/:modelId", () => {
  it("streams the stored .pth bytes for a valid token (200)", async () => {
    const res = await supertest(app)
      .get(`/api/inference/artifact/${STORED_MODEL}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString()).toBe(STORED_BYTES);
  });

  it("404s when the model has no stored artifact", async () => {
    const res = await supertest(app)
      .get(`/api/inference/artifact/no-such-model-${Date.now()}`)
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it("401s on a wrong token", async () => {
    const res = await supertest(app)
      .get(`/api/inference/artifact/${STORED_MODEL}`)
      .set("Authorization", "Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("401s when the Authorization header is missing", async () => {
    const res = await supertest(app).get(`/api/inference/artifact/${STORED_MODEL}`);
    expect(res.status).toBe(401);
  });

  it("FAILS CLOSED with 503 when INFERENCE_SHARED_TOKEN is unset (never allow-all)", async () => {
    delete process.env["INFERENCE_SHARED_TOKEN"];
    const res = await supertest(app)
      .get(`/api/inference/artifact/${STORED_MODEL}`)
      .set("Authorization", "Bearer anything");
    expect(res.status).toBe(503);
  });

  it("FAILS CLOSED with 503 when INFERENCE_SHARED_TOKEN is empty", async () => {
    process.env["INFERENCE_SHARED_TOKEN"] = "";
    const res = await supertest(app)
      .get(`/api/inference/artifact/${STORED_MODEL}`)
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(503);
  });

  it("rejects a traversal-shaped :modelId (not 200)", async () => {
    // %2e%2e%2f decodes to ../ — the artifact store must refuse to resolve it.
    const res = await supertest(app)
      .get("/api/inference/artifact/%2e%2e%2f%2e%2e%2fpackage.json")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).not.toBe(200);
  });

  it("rejects an absolute-path :modelId (not 200)", async () => {
    const res = await supertest(app)
      .get("/api/inference/artifact/%2Fetc%2Fpasswd")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).not.toBe(200);
  });

  it("404s when the file resolves but res.download fails mid-stream", async () => {
    // STORED_MODEL is seeded (beforeEach), so the ref resolves and we reach
    // res.download; force its callback to fire with an error to exercise the
    // post-resolve failure path.
    let status = 0;
    const res = {
      headersSent: false,
      status(code: number) {
        status = code;
        return this;
      },
      send() {
        return this;
      },
      download(_file: string, _name: string, _opts: unknown, cb: (err: Error) => void) {
        cb(new Error("stream broke"));
      },
    };
    await getArtifact({ params: { modelId: STORED_MODEL } } as never, res as never);
    expect(status).toBe(404);
  });
});
