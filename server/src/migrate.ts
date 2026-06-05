/* eslint no-console: "off" */

/**
 * GameNite migration CLI.
 *
 * Usage (from repo root):
 *   npm run -w server migrate              # apply all pending migrations
 *   npm run -w server migrate:status       # show applied vs pending
 *   npm run -w server migrate:create NAME  # scaffold a new migration file
 *
 * MongoDB connection is read from MONGO_STR / MONGO_DB_NAME in server/.env
 * (the same env vars the server uses). If MONGO_STR is unset the CLI uses
 * the in-memory keyv store, which is only useful for testing the CLI itself.
 */

import { KeyvMongo } from "@keyv/mongo";
import { Keyv } from "keyv";
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { setDbInitializer } from "./keyv.ts";
import {
  getMigrationStatus,
  loadAllMigrations,
  runPendingMigrations,
} from "./migrations/MigrationRunner.ts";

const MONGO_STR = process.env.MONGO_STR || null;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "GameNite";

if (MONGO_STR) {
  setDbInitializer(<T>(name: string) => {
    const mongoConnection = new KeyvMongo(MONGO_STR, { collection: name, db: MONGO_DB_NAME });
    return new Keyv<T>(mongoConnection);
  });
  console.log(`[migrate] connected to MongoDB (db=${MONGO_DB_NAME})`);
} else {
  console.log(`[migrate] WARNING: MONGO_STR not set; using in-memory keyv store`);
}

const SUBCOMMAND = process.argv[2] ?? "up";

if (SUBCOMMAND === "up") {
  await cmdUp();
} else if (SUBCOMMAND === "status") {
  await cmdStatus();
} else if (SUBCOMMAND === "create") {
  cmdCreate(process.argv[3]);
} else {
  console.error(`Unknown command: ${SUBCOMMAND}`);
  printUsage();
  process.exit(1);
}

process.exit(0);

async function cmdUp(): Promise<void> {
  console.log(`[migrate] loading migrations...`);
  const migrations = await loadAllMigrations();
  console.log(`[migrate] found ${migrations.length} migration(s)`);
  console.log(`[migrate] running pending...`);
  const { applied, skipped } = await runPendingMigrations(migrations);
  console.log(`[migrate] done. applied=${applied.length} skipped=${skipped.length}`);
}

async function cmdStatus(): Promise<void> {
  const migrations = await loadAllMigrations();
  const status = await getMigrationStatus(migrations);
  console.log(`[migrate] status (${migrations.length} total)`);
  console.log(``);
  console.log(`Applied (${status.applied.length}):`);
  for (const a of status.applied) {
    console.log(`  + ${a.id}  (applied ${a.appliedAt})`);
    console.log(`        ${a.description}`);
  }
  console.log(``);
  console.log(`Pending (${status.pending.length}):`);
  for (const p of status.pending) {
    console.log(`  - ${p.id}`);
    console.log(`        ${p.description}`);
  }
}

function cmdCreate(rawName: string | undefined): void {
  if (!rawName) {
    console.error(`Usage: npm run -w server migrate:create <name>`);
    console.error(`  e.g. npm run -w server migrate:create add_user_avatar_url`);
    process.exit(1);
  }
  const safeName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!safeName) {
    console.error(`Invalid migration name: must contain at least one letter or digit`);
    process.exit(1);
  }

  const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));
  const existing = readdirSync(migrationsDir).filter((f) => /^\d{3}_.*\.ts$/.test(f));
  const lastNum =
    existing.length === 0 ? -1 : Math.max(...existing.map((f) => parseInt(f.slice(0, 3), 10)));
  const nextNum = String(lastNum + 1).padStart(3, "0");
  const id = `${nextNum}_${safeName}`;
  const filename = `${id}.ts`;
  const filePath = join(migrationsDir, filename);

  const template = `import type { Migration } from "./MigrationRunner.ts";
// import the repos and types you need; remove unused imports before committing.
// e.g.
//   import { UserRepo } from "../repository.ts";
//   import type { UserRecord } from "../models.ts";

export const migration: Migration = {
  id: "${id}",
  description: "TODO describe what this migration changes",
  up: async () => {
    // Write the migration logic here.
    //
    // Example - backfill a new field on every existing UserRecord:
    //
    //   const keys = await UserRepo.getAllKeys();
    //   for (const key of keys) {
    //     const u = await UserRepo.find(key);
    //     if (!u || u.newField !== undefined) continue;
    //     await UserRepo.set(key, { ...u, newField: "default value" });
    //   }
    //
    // Rules:
    //   1. Idempotent: re-running the script must be a no-op. Always check
    //      whether the change is already present before writing.
    //   2. Forward-only: no down(). If you need to revert, write a new
    //      migration that undoes it.
    //   3. No cross-migration imports: each migration must be self-contained.
    //   4. Update db/SCHEMA.md with the new fields you added.
    throw new Error("TODO: implement migration '${id}'");
  },
};
`;

  writeFileSync(filePath, template, { flag: "wx" });
  console.log(`Created server/src/migrations/${filename}`);
  console.log(``);
  console.log(`Next steps:`);
  console.log(`  1. Edit server/src/migrations/${filename} - implement up()`);
  console.log(`  2. Update db/SCHEMA.md with the new fields`);
  console.log(`  3. Run: npm run -w server migrate:status   (to verify it's pending)`);
  console.log(`  4. Run: npm run -w server migrate          (to apply locally)`);
  console.log(`  5. Commit the new migration file and the SCHEMA.md update together.`);
}

function printUsage(): void {
  console.error(`Usage:`);
  console.error(`  npm run -w server migrate              apply pending migrations`);
  console.error(`  npm run -w server migrate:status       show applied vs pending`);
  console.error(`  npm run -w server migrate:create NAME  scaffold a new migration`);
}
