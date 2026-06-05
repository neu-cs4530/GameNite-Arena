import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MigrationLogRepo } from "../repository.ts";

/**
 * A single migration step. Each step is identified by a unique sequential id
 * (NNN_name, see naming convention in db/SCHEMA.md), declares what it changes
 * in human-readable terms, and provides an idempotent `up()` function.
 *
 * Forward-only: there is no down(). Rolling back schemaless mutations is
 * complex and error-prone. If a migration needs to be reverted, write a new
 * migration that undoes it.
 */
export interface Migration {
  id: string;
  description: string;
  up: () => Promise<void>;
}

const MIGRATIONS_DIR = fileURLToPath(new URL(".", import.meta.url));
const migrationFilePattern = /^\d{3}_[a-z0-9_]+\.ts$/;

function isMigration(x: unknown): x is Migration {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" && typeof o.description === "string" && typeof o.up === "function"
  );
}

/**
 * Discovers every migration file in the migrations directory at runtime.
 * Files must match the pattern `NNN_name.ts` and export a `migration` object.
 * Returns the list sorted by id (which is the same as sorted by filename).
 */
export async function loadAllMigrations(): Promise<Migration[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => migrationFilePattern.test(f))
    .sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    // The static `.ts` suffix lets Vite analyze the dynamic import; the runtime
    // path is the same as `./${file}`.
    const baseName = file.slice(0, -3);
    const mod = (await import(`./${baseName}.ts`)) as unknown;
    const candidate =
      typeof mod === "object" && mod !== null
        ? (mod as Record<string, unknown>).migration
        : undefined;
    if (!isMigration(candidate)) {
      throw new Error(
        `Migration file ${file} must export a 'migration' object with id, description, and up()`,
      );
    }
    if (`${candidate.id}.ts` !== file) {
      throw new Error(
        `Migration ${file} has id '${candidate.id}' which does not match its filename`,
      );
    }
    migrations.push(candidate);
  }
  return migrations;
}

export interface MigrationStatus {
  applied: { id: string; description: string; appliedAt: string }[];
  pending: { id: string; description: string }[];
}

export async function getMigrationStatus(migrations: Migration[]): Promise<MigrationStatus> {
  const applied: MigrationStatus["applied"] = [];
  const pending: MigrationStatus["pending"] = [];

  for (const m of migrations) {
    const log = await MigrationLogRepo.find(m.id);
    if (log) {
      applied.push({ id: m.id, description: m.description, appliedAt: log.appliedAt });
    } else {
      pending.push({ id: m.id, description: m.description });
    }
  }

  return { applied, pending };
}

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
}

/**
 * Runs every pending migration in id order. Idempotent: migrations whose id
 * appears in MigrationLogRepo are skipped.
 *
 * Each migration is responsible for its own internal idempotency (check before
 * writing). The runner only guarantees that a given migration's `up()` runs
 * at most once successfully across all calls. If `up()` throws, the migration
 * is NOT recorded as applied, so it will retry on the next run.
 */
// Default log function for the runner. Defined as a named binding instead of
// `console.log` directly so eslint's no-console rule has a single annotated
// callsite to look at.
// eslint-disable-next-line no-console
const defaultLog = (msg: string): void => console.log(msg);

export async function runPendingMigrations(
  migrations: Migration[],
  log: (msg: string) => void = defaultLog,
): Promise<MigrationRunResult> {
  const result: MigrationRunResult = { applied: [], skipped: [] };

  for (const m of migrations) {
    const existing = await MigrationLogRepo.find(m.id);
    if (existing) {
      log(`  - skip ${m.id} (already applied ${existing.appliedAt})`);
      result.skipped.push(m.id);
      continue;
    }

    log(`  > ${m.id} - ${m.description}`);
    const start = Date.now();
    try {
      await m.up();
    } catch (err) {
      log(`  ! ${m.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    const durationMs = Date.now() - start;
    await MigrationLogRepo.set(m.id, {
      id: m.id,
      description: m.description,
      appliedAt: new Date().toISOString(),
      durationMs,
    });
    log(`  + applied ${m.id} in ${durationMs}ms`);
    result.applied.push(m.id);
  }

  return result;
}
