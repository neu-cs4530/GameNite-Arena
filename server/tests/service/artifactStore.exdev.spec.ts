import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ARTIFACT_ROOT, storeModelArtifact } from "../../src/services/artifactStore.service.ts";

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, renameSync: vi.fn(), existsSync: vi.fn() };
});

const CLEANUP: string[] = [];

beforeEach(async () => {
  const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(fs.renameSync).mockImplementation(realFs.renameSync);
  vi.mocked(fs.existsSync).mockImplementation(realFs.existsSync);
});

afterEach(() => {
  for (const p of CLEANUP.splice(0)) {
    try { fs.unlinkSync(p); } catch {}
  }
});

function makeUpload(content: string): string {
  const p = path.join(os.tmpdir(), `exdev-spec-${Date.now()}-${Math.random()}.pth`);
  fs.writeFileSync(p, content);
  CLEANUP.push(p);
  return p;
}

describe("storeModelArtifact — ARTIFACT_ROOT absent", () => {
  it("creates the dir when ARTIFACT_ROOT does not exist", async () => {
    const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const uploaded = makeUpload("model data");
    vi.mocked(fs.existsSync)
      .mockImplementationOnce(realFs.existsSync)
      .mockImplementationOnce(() => false);
    const stored = await storeModelArtifact("spec-exdev-mkdir", uploaded);
    CLEANUP.push(path.join(ARTIFACT_ROOT, stored.ref));
    expect(fs.existsSync(path.join(ARTIFACT_ROOT, "spec-exdev-mkdir.pth"))).toBe(true);
  });
});

describe("storeModelArtifact — renameSync failures", () => {
  it("falls back to copy+delete on EXDEV", async () => {
    const uploaded = makeUpload("model bytes");
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      const err = new Error("EXDEV") as NodeJS.ErrnoException;
      err.code = "EXDEV";
      throw err;
    });
    const stored = await storeModelArtifact("spec-exdev-copy", uploaded);
    CLEANUP.push(path.join(ARTIFACT_ROOT, stored.ref));
    expect(fs.existsSync(path.join(ARTIFACT_ROOT, "spec-exdev-copy.pth"))).toBe(true);
    expect(fs.existsSync(uploaded)).toBe(false);
  });

  it("re-throws non-EXDEV rename errors", async () => {
    const uploaded = makeUpload("model bytes 2");
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      const err = new Error("EPERM") as NodeJS.ErrnoException;
      err.code = "EPERM";
      throw err;
    });
    await expect(storeModelArtifact("spec-exdev-rethrow", uploaded)).rejects.toThrow("EPERM");
  });
});
