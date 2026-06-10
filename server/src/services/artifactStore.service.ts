/**
 * server/src/services/artifactStore.service.ts
 * ==============================================
 * Single owner of trained-model artifact storage.
 *
 * Layout contract: one root directory, one file per model, named
 * `<modelId>.pth`. This is EXACTLY the layout the Python inference service
 * loads from (ai/inference-service/inference_service.py builds
 * `MODEL_STORE / f"{model_id}.pth"` on /inference/load), so a deployed
 * model finds its artifact with zero glue code — point the inference
 * service's MODEL_STORE_PATH at this directory and load requests just work.
 *
 * Rules enforced here so no caller has to remember them:
 *  - Writes go through storeModelArtifact(): the upload is MOVED (not
 *    copied) into the canonical name atomically, and integrity metadata
 *    (bytes, sha256) is computed for the model record. A retrain replaces
 *    the previous artifact for that model.
 *  - Reads go through resolveArtifactRef(): refs are names inside the
 *    root, never paths. Anything absolute, escaping, or missing resolves
 *    to null — file-serving code cannot be steered outside the store.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Same directory the upload middleware writes to (cwd is server/). */
export const ARTIFACT_ROOT = path.resolve("models");

export interface StoredArtifactInfo {
  /** Store-relative ref to persist on the ModelRecord: `<modelId>.pth`. */
  ref: string;
  bytes: number;
  sha256: string;
  storedAt: string;
}

/** The canonical artifact name for a model — the inference-service convention. */
export function artifactRefForModel(modelId: string): string {
  return `${modelId}.pth`;
}

/**
 * Move an uploaded .pth into its canonical location and report integrity
 * metadata. The temp upload ceases to exist; the canonical file is the one
 * copy of the artifact.
 */
export async function storeModelArtifact(
  modelId: string,
  uploadedPath: string,
): Promise<StoredArtifactInfo> {
  if (!fs.existsSync(uploadedPath)) {
    throw new Error(`Uploaded artifact not found at ${uploadedPath}`);
  }
  if (!fs.existsSync(ARTIFACT_ROOT)) {
    fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  }

  const ref = artifactRefForModel(modelId);
  const target = path.join(ARTIFACT_ROOT, ref);

  const { bytes, sha256 } = await hashFile(uploadedPath);

  try {
    fs.renameSync(uploadedPath, target);
  } catch (err) {
    // Cross-device upload location (e.g. an OS temp dir on another volume):
    // fall back to copy + remove.
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      fs.copyFileSync(uploadedPath, target);
      fs.unlinkSync(uploadedPath);
    } else {
      throw err;
    }
  }

  return { ref, bytes, sha256, storedAt: new Date().toISOString() };
}

/**
 * Absolute path for a stored ref, or null when the ref is missing, escapes
 * the root, or has no file behind it. The ONLY way file-serving code should
 * turn a record's artifactRef into a filesystem path.
 */
export function resolveArtifactRef(ref: string | undefined | null): string | null {
  if (!ref) return null;
  if (path.isAbsolute(ref)) return null;
  const target = path.resolve(ARTIFACT_ROOT, ref);
  if (!target.startsWith(ARTIFACT_ROOT + path.sep)) return null;
  return fs.existsSync(target) ? target : null;
}

async function hashFile(filePath: string): Promise<{ bytes: number; sha256: string }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      hash.update(buffer);
    });
    stream.on("end", () => resolve({ bytes, sha256: hash.digest("hex") }));
    stream.on("error", reject);
  });
}
