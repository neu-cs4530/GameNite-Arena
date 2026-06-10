import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration } from "./MigrationRunner.ts";
import { ModelRepo } from "../repository.ts";
import { ARTIFACT_ROOT, artifactRefForModel } from "../services/artifactStore.service.ts";

/**
 * Artifact storage moved behind artifactStore.service.ts: artifacts live at
 * `models/<modelId>.pth` (the layout the inference service loads from) and
 * ModelRecord.artifactRef holds the store-relative name, never an absolute
 * path. This migration brings legacy records into that shape:
 *
 *  - absolute ref + file exists  -> file renamed to `<modelId>.pth`,
 *    ref rewritten to the canonical name
 *  - absolute ref + file missing -> ref cleared (dangling pointer; keeps
 *    hasArtifact truthful)
 *  - relative ref or no ref      -> untouched
 *
 * Idempotency: only absolute refs are touched, and the rewrite produces a
 * relative ref, so a second run is a no-op.
 */
export const migration: Migration = {
  id: "001_canonical_artifact_refs",
  description:
    "Normalize ModelRecord.artifactRef from legacy absolute paths to canonical " +
    "store-relative <modelId>.pth names; clear refs whose files are gone.",
  up: async () => {
    const keys = await ModelRepo.getAllKeys();
    for (const key of keys) {
      const model = await ModelRepo.find(key);
      if (!model?.artifactRef) continue;
      if (!path.isAbsolute(model.artifactRef)) continue; // already canonical

      if (fs.existsSync(model.artifactRef)) {
        const canonicalRef = artifactRefForModel(key);
        const target = path.join(ARTIFACT_ROOT, canonicalRef);
        if (path.resolve(model.artifactRef) !== target) {
          fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
          fs.renameSync(model.artifactRef, target);
        }
        await ModelRepo.set(key, { ...model, artifactRef: canonicalRef });
      } else {
        const { artifactRef: _dangling, ...rest } = model;
        await ModelRepo.set(key, rest);
      }
    }
  },
};
