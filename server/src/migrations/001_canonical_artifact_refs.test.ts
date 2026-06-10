import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ModelRepo } from "../repository.ts";
import { ARTIFACT_ROOT } from "../services/artifactStore.service.ts";
import { migration } from "./001_canonical_artifact_refs.ts";

const CLEANUP_PATHS: string[] = [];

function modelRecord(artifactRef?: string) {
  const now = new Date().toISOString();
  return {
    userId: "owner-id",
    gameKey: "nim" as const,
    displayName: "legacy model",
    sourceRef: "local-training",
    artifactRef,
    visibility: "private" as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe("001_canonical_artifact_refs", () => {
  beforeEach(async () => {
    await ModelRepo.clear();
  });

  afterEach(() => {
    for (const p of CLEANUP_PATHS.splice(0)) {
      try {
        fs.unlinkSync(p);
      } catch {
        // already gone
      }
    }
  });

  it("renames a legacy absolute-path artifact into the canonical store name", async () => {
    // Legacy layout: multer timestamp name, absolute path on the record.
    const legacyPath = path.join(ARTIFACT_ROOT, `1234567-${Math.random()}-upload.pth`);
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
    fs.writeFileSync(legacyPath, "legacy weights");
    CLEANUP_PATHS.push(legacyPath);

    const modelId = await ModelRepo.add(modelRecord(legacyPath));
    CLEANUP_PATHS.push(path.join(ARTIFACT_ROOT, `${modelId}.pth`));

    await migration.up();

    const migrated = await ModelRepo.get(modelId);
    expect(migrated.artifactRef).toBe(`${modelId}.pth`);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.readFileSync(path.join(ARTIFACT_ROOT, `${modelId}.pth`)).toString()).toBe(
      "legacy weights",
    );
  });

  it("clears dangling absolute refs whose files no longer exist", async () => {
    const modelId = await ModelRepo.add(
      modelRecord(path.join(ARTIFACT_ROOT, "long-gone-upload.pth")),
    );

    await migration.up();

    const migrated = await ModelRepo.get(modelId);
    expect(migrated.artifactRef).toBeUndefined();
  });

  it("is idempotent and leaves canonical refs and artifact-less models alone", async () => {
    const canonicalId = await ModelRepo.add(modelRecord("already-canonical.pth"));
    const bareId = await ModelRepo.add(modelRecord(undefined));

    await migration.up();
    await migration.up();

    expect((await ModelRepo.get(canonicalId)).artifactRef).toBe("already-canonical.pth");
    expect((await ModelRepo.get(bareId)).artifactRef).toBeUndefined();
  });
});
