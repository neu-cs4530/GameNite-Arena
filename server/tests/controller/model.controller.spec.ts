import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import supertest from "supertest";
import { app } from "../../src/app.ts";
import {
  getById,
  getByUsername,
  patchDeploymentStatus,
  postDeploy,
  postFork,
  postUpload,
} from "../../src/controllers/model.controller.ts";
import * as modelService from "../../src/services/model.service.ts";

/* ---------------------------------------------------------------------------
 * Controller-level tests for /api/model: status mapping and request
 * validation. model.service is mocked throughout (its behavior is covered by
 * model.service.spec.ts); the two supertest requests at the bottom exercise
 * the real multer middleware.
 * ------------------------------------------------------------------------- */

vi.mock("../../src/services/model.service.ts", () => ({
  uploadModel: vi.fn(),
  forkModel: vi.fn(),
  getModelById: vi.fn(),
  getModelsByUser: vi.fn(),
  deployModel: vi.fn(),
  updateDeploymentStatus: vi.fn(),
}));

const auth0 = { username: "user0", password: "pwd0000" };
const authBad = { username: "user0", password: "nope" };

interface SentResponse {
  status: number | undefined;
  body: unknown;
}

function makeRes(): { res: never; sent: SentResponse } {
  const sent: SentResponse = { status: undefined, body: undefined };
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  return { res: res as never, sent };
}

function makeReq(overrides: Record<string, unknown>): never {
  return overrides as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getById", () => {
  it("404s for a missing model and 200s for a found one", async () => {
    vi.mocked(modelService.getModelById).mockResolvedValueOnce(null);
    const missing = makeRes();
    await getById(makeReq({ params: { id: "nope" } }), missing.res);
    expect(missing.sent.status).toBe(404);

    const info = { modelId: "m1" } as Awaited<ReturnType<typeof modelService.getModelById>>;
    vi.mocked(modelService.getModelById).mockResolvedValueOnce(info);
    const found = makeRes();
    await getById(makeReq({ params: { id: "m1" } }), found.res);
    expect(found.sent.body).toEqual({ modelId: "m1" });
  });
});

describe("getByUsername", () => {
  it("404s for an unknown username", async () => {
    const { res, sent } = makeRes();
    await getByUsername(makeReq({ params: { username: "who-dis" } }), res);
    expect(sent.status).toBe(404);
  });

  it("returns the user's models", async () => {
    vi.mocked(modelService.getModelsByUser).mockResolvedValueOnce([]);
    const { res, sent } = makeRes();
    // user3 sits late in the seeded scan, exercising the skip path too.
    await getByUsername(makeReq({ params: { username: "user3" } }), res);
    expect(sent.body).toEqual([]);
  });
});

describe("postDeploy", () => {
  const params = { id: "m1" };

  it("400s on a malformed body", async () => {
    const { res, sent } = makeRes();
    await postDeploy(makeReq({ params, body: { auth: auth0, payload: 5 } }), res);
    expect(sent.status).toBe(400);
  });

  it("403s on bad credentials", async () => {
    const { res, sent } = makeRes();
    await postDeploy(makeReq({ params, body: { auth: authBad, payload: {} } }), res);
    expect(sent.status).toBe(403);
  });

  it.each([
    ["Model m1 not found", 404],
    ["User user0 does not own model m1", 403],
    ["Inference load failed: bad artifact", 422],
  ] as const)("maps '%s' to %d", async (message, status) => {
    vi.mocked(modelService.deployModel).mockRejectedValueOnce(new Error(message));
    const { res, sent } = makeRes();
    await postDeploy(makeReq({ params, body: { auth: auth0, payload: {} } }), res);
    expect(sent.status).toBe(status);
    expect(sent.body).toEqual({ error: message });
  });

  it("falls back to a generic message for non-Error throws", async () => {
    vi.mocked(modelService.deployModel).mockRejectedValueOnce("boom");
    const { res, sent } = makeRes();
    await postDeploy(makeReq({ params, body: { auth: auth0, payload: {} } }), res);
    expect(sent.status).toBe(422);
    expect(sent.body).toEqual({ error: "Deploy failed" });
  });

  it("201s with the deployment on success", async () => {
    const dep = { deploymentId: "d1" } as Awaited<ReturnType<typeof modelService.deployModel>>;
    vi.mocked(modelService.deployModel).mockResolvedValueOnce(dep);
    const { res, sent } = makeRes();
    await postDeploy(
      makeReq({ params, body: { auth: auth0, payload: { displayName: "live" } } }),
      res,
    );
    expect(sent.status).toBe(201);
    expect(sent.body).toEqual({ deploymentId: "d1" });
  });
});

describe("patchDeploymentStatus", () => {
  const params = { id: "d1" };

  it("400s on a malformed body", async () => {
    const { res, sent } = makeRes();
    await patchDeploymentStatus(
      makeReq({ params, body: { auth: auth0, payload: "destroyed" } }),
      res,
    );
    expect(sent.status).toBe(400);
  });

  it("403s on bad credentials", async () => {
    const { res, sent } = makeRes();
    await patchDeploymentStatus(
      makeReq({ params, body: { auth: authBad, payload: "paused" } }),
      res,
    );
    expect(sent.status).toBe(403);
  });

  it.each([
    ["Deployment d1 not found", 404],
    ["User user0 does not own deployment d1", 403],
    ["weird failure", 422],
  ] as const)("maps '%s' to %d", async (message, status) => {
    vi.mocked(modelService.updateDeploymentStatus).mockRejectedValueOnce(new Error(message));
    const { res, sent } = makeRes();
    await patchDeploymentStatus(
      makeReq({ params, body: { auth: auth0, payload: "retired" } }),
      res,
    );
    expect(sent.status).toBe(status);
  });

  it("falls back to a generic message for non-Error throws", async () => {
    vi.mocked(modelService.updateDeploymentStatus).mockRejectedValueOnce("boom");
    const { res, sent } = makeRes();
    await patchDeploymentStatus(
      makeReq({ params, body: { auth: auth0, payload: "retired" } }),
      res,
    );
    expect(sent.body).toEqual({ error: "Update failed" });
  });

  it("sends the updated deployment on success", async () => {
    const dep = { deploymentId: "d1", status: "paused" } as Awaited<
      ReturnType<typeof modelService.updateDeploymentStatus>
    >;
    vi.mocked(modelService.updateDeploymentStatus).mockResolvedValueOnce(dep);
    const { res, sent } = makeRes();
    await patchDeploymentStatus(makeReq({ params, body: { auth: auth0, payload: "paused" } }), res);
    expect(sent.body).toEqual({ deploymentId: "d1", status: "paused" });
  });
});

describe("postFork error mapping", () => {
  it("422s on a generic fork failure and on non-Error throws", async () => {
    vi.mocked(modelService.forkModel).mockRejectedValueOnce(new Error("weird failure"));
    const first = makeRes();
    await postFork(
      makeReq({ params: { modelId: "m1" }, body: { auth: auth0, payload: {} } }),
      first.res,
    );
    expect(first.sent.status).toBe(422);
    expect(first.sent.body).toEqual({ error: "weird failure" });

    vi.mocked(modelService.forkModel).mockRejectedValueOnce("boom");
    const second = makeRes();
    await postFork(
      makeReq({ params: { modelId: "m1" }, body: { auth: auth0, payload: {} } }),
      second.res,
    );
    expect(second.sent.body).toEqual({ error: "Fork failed" });
  });
});

describe("postUpload", () => {
  function makeTempFile(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "model-upload-spec-"));
    const filePath = path.join(dir, "upload.pth");
    fs.writeFileSync(filePath, "weights");
    return filePath;
  }

  const goodMetadata = JSON.stringify({ game: "nim", adapterVersion: "1.0.0", trainedAt: 1 });

  it("400s when no file arrived", async () => {
    const { res, sent } = makeRes();
    await postUpload(makeReq({ body: {} }), res);
    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({ error: "No .pth file provided" });
  });

  it("400s and unlinks the file on a malformed body", async () => {
    const filePath = makeTempFile();
    const { res, sent } = makeRes();
    await postUpload(makeReq({ file: { path: filePath }, body: { nope: true } }), res);
    expect(sent.status).toBe(400);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("403s and unlinks the file on bad credentials", async () => {
    const filePath = makeTempFile();
    const { res, sent } = makeRes();
    await postUpload(
      makeReq({
        file: { path: filePath },
        body: { auth: authBad, payload: { displayName: "x", metadata: goodMetadata } },
      }),
      res,
    );
    expect(sent.status).toBe(403);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it.each([
    ["not-json", "unparsable metadata"],
    [JSON.stringify({ game: "nim" }), "missing metadata fields"],
  ])("400s and unlinks the file on %s", async (metadata) => {
    const filePath = makeTempFile();
    const { res, sent } = makeRes();
    await postUpload(
      makeReq({
        file: { path: filePath },
        body: { auth: auth0, payload: { displayName: "x", metadata } },
      }),
      res,
    );
    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({ error: "Invalid or missing .pth metadata field" });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("201s with the created model on success", async () => {
    const filePath = makeTempFile();
    const info = { modelId: "m-new" } as Awaited<ReturnType<typeof modelService.uploadModel>>;
    vi.mocked(modelService.uploadModel).mockResolvedValueOnce(info);
    const { res, sent } = makeRes();
    await postUpload(
      makeReq({
        file: { path: filePath },
        body: { auth: auth0, payload: { displayName: "x", metadata: goodMetadata } },
      }),
      res,
    );
    expect(sent.status).toBe(201);
    expect(sent.body).toEqual({ modelId: "m-new" });
  });

  it("422s when the upload itself fails, generic for non-Error throws", async () => {
    const filePath = makeTempFile();
    vi.mocked(modelService.uploadModel).mockRejectedValueOnce(new Error("artifact rejected"));
    const first = makeRes();
    await postUpload(
      makeReq({
        file: { path: filePath },
        body: { auth: auth0, payload: { displayName: "x", metadata: goodMetadata } },
      }),
      first.res,
    );
    expect(first.sent.status).toBe(422);
    expect(first.sent.body).toEqual({ error: "artifact rejected" });

    vi.mocked(modelService.uploadModel).mockRejectedValueOnce("boom");
    const second = makeRes();
    await postUpload(
      makeReq({
        file: { path: makeTempFile() },
        body: { auth: auth0, payload: { displayName: "x", metadata: goodMetadata } },
      }),
      second.res,
    );
    expect(second.sent.body).toEqual({ error: "Upload failed" });
  });
});

describe("upload middleware (real multer)", () => {
  it("accepts a .pth file and reaches the controller", async () => {
    // Multipart fields arrive as flat strings, so the controller rejects the
    // body shape with 400 — which proves the middleware stored the file and
    // handed off. (The unlink of the stored temp file is the controller's.)
    const response = await supertest(app)
      .post("/api/model/upload")
      .field("auth", "not-an-object")
      .attach("file", Buffer.from("weights"), "model.pth");
    expect(response.status).toBe(400);
  });

  it("rejects non-.pth files", async () => {
    const response = await supertest(app)
      .post("/api/model/upload")
      .attach("file", Buffer.from("nope"), "notes.txt");
    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});
