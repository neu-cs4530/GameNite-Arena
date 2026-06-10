import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import {
  ARTIFACT_ROOT,
  artifactRefForModel,
  storeModelArtifact,
  resolveArtifactRef,
} from "../../src/services/artifactStore.service.ts";

/* ---------------------------------------------------------------------------
 * The artifact store is the single owner of trained-model files. Everything
 * that accepts, names, verifies, or serves a .pth goes through it, so the
 * on-disk layout stays canonical (<modelId>.pth under one root — the exact
 * layout ai/inference-service/inference_service.py loads from) and no code
 * path can read or serve files outside the root.
 * ------------------------------------------------------------------------- */

const CLEANUP_PATHS: string[] = [];

afterEach(() => {
  for (const p of CLEANUP_PATHS.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {
      // already gone
    }
  }
});

function makeUpload(content: string): string {
  const uploaded = path.join(os.tmpdir(), `artifact-spec-${Date.now()}-${Math.random()}.pth`);
  fs.writeFileSync(uploaded, content);
  CLEANUP_PATHS.push(uploaded);
  return uploaded;
}

describe("artifactRefForModel", () => {
  it("is the inference-service naming convention: <modelId>.pth", () => {
    expect(artifactRefForModel("abc-123")).toBe("abc-123.pth");
  });
});

describe("storeModelArtifact", () => {
  it("moves the upload to the canonical location and reports integrity metadata", async () => {
    const uploaded = makeUpload("real torch bytes");

    const stored = await storeModelArtifact("spec-model-1", uploaded);
    CLEANUP_PATHS.push(path.join(ARTIFACT_ROOT, stored.ref));

    expect(stored.ref).toBe("spec-model-1.pth");
    expect(stored.bytes).toBe(Buffer.byteLength("real torch bytes"));
    expect(stored.sha256).toBe(createHash("sha256").update("real torch bytes").digest("hex"));
    expect(Date.parse(stored.storedAt)).not.toBeNaN();

    // Moved, not copied: canonical file exists, the temp upload is gone.
    const canonical = path.join(ARTIFACT_ROOT, "spec-model-1.pth");
    expect(fs.readFileSync(canonical).toString()).toBe("real torch bytes");
    expect(fs.existsSync(uploaded)).toBe(false);
  });

  it("a retrain replaces the previous artifact for the same model", async () => {
    const first = makeUpload("v1");
    const second = makeUpload("v2");

    await storeModelArtifact("spec-model-2", first);
    const stored = await storeModelArtifact("spec-model-2", second);
    CLEANUP_PATHS.push(path.join(ARTIFACT_ROOT, stored.ref));

    expect(fs.readFileSync(path.join(ARTIFACT_ROOT, "spec-model-2.pth")).toString()).toBe("v2");
  });

  it("rejects a missing upload path", async () => {
    await expect(storeModelArtifact("spec-model-3", "/tmp/does-not-exist.pth")).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("resolveArtifactRef", () => {
  it("resolves a stored ref to an absolute path inside the root", async () => {
    const stored = await storeModelArtifact("spec-model-4", makeUpload("x"));
    CLEANUP_PATHS.push(path.join(ARTIFACT_ROOT, stored.ref));

    const resolved = resolveArtifactRef(stored.ref);
    expect(resolved).toBe(path.join(ARTIFACT_ROOT, "spec-model-4.pth"));
  });

  it("returns null for refs that do not exist", () => {
    expect(resolveArtifactRef("nope.pth")).toBeNull();
  });

  it("refuses refs that escape the artifact root", () => {
    expect(resolveArtifactRef("../package.json")).toBeNull();
    expect(resolveArtifactRef("../../etc/passwd")).toBeNull();
    expect(resolveArtifactRef("/etc/passwd")).toBeNull();
    expect(resolveArtifactRef("")).toBeNull();
  });
});
