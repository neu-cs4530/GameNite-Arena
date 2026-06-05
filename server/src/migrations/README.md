# Migration framework

GameNite's MongoDB-backed storage has no enforced schema. "Migration" here
means evolving the JSON shape of stored documents and adding new collections,
recorded in `MigrationLogRepo` so every developer and every environment
converges on the current schema.

The contract is:

1. **Every change to `server/src/models.ts` ships with a migration.** If you
   add a field, write a migration that backfills it on existing docs.
2. **Every migration is idempotent.** Re-running the script must be a no-op
   once the migration has been applied. Always check before writing.
3. **Forward only.** There is no `down()`. If you need to revert, write a new
   migration that undoes it.
4. **Every migration updates `db/SCHEMA.md` in the same commit.** Reviewers
   will reject migrations that don't update the schema doc.

## Authoring a new migration

```bash
npm run -w server migrate:create add_user_avatar_url
```

This scaffolds `server/src/migrations/NNN_add_user_avatar_url.ts` with the
next sequential id and a fill-in-the-blanks template. The file is
auto-discovered by the runner: no registration step needed.

Open the new file and implement `up()`. Typical patterns:

### Backfill a new field on every existing user

```ts
import type { Migration } from "./MigrationRunner.ts";
import { UserRepo } from "../repository.ts";

export const migration: Migration = {
  id: "001_add_user_avatar_url",
  description: "Add avatarUrl field to every UserRecord, default null",
  up: async () => {
    const keys = await UserRepo.getAllKeys();
    for (const key of keys) {
      const u = await UserRepo.find(key);
      if (!u || u.avatarUrl !== undefined) continue; // idempotency check
      await UserRepo.set(key, { ...u, avatarUrl: null });
    }
  },
};
```

### Add a new collection

The collection comes into existence as soon as you call `createRepo` in
`repository.ts`. Empty collections need no backfill. A migration is still
useful for tracking when the new repo was introduced:

```ts
export const migration: Migration = {
  id: "002_add_highlight_repo",
  description: "Register the new highlight repo (no data backfill needed)",
  up: async () => {
    // Intentionally empty: HighlightRepo was added to repository.ts in the
    // same commit. New collections start empty; nothing to backfill.
  },
};
```

### Rename or split fields

Use a two-step migration if the field is widely used:

1. First migration: write the new field alongside the old one
2. Application code: read the new field; ignore the old
3. Second migration (later release): delete the old field

This avoids a window where some replicas have one schema and some have the
other.

## Running migrations

```bash
# what's applied and what's pending
npm run -w server migrate:status

# apply every pending migration (the team's everyday command after pulling)
npm run -w server migrate
```

Connection settings come from `server/.env` (`MONGO_STR`, `MONGO_DB_NAME`),
same as the server itself.

## Workflow when pulling teammate changes

```bash
git pull
npm install
npm run -w server migrate    # bring local DB up to current schema
npm run dev
```

If `migrate:status` shows pending migrations, run `migrate` before starting
the server. Otherwise the server may read documents missing fields the
application code expects.

## File and naming conventions

- **Filename:** `NNN_short_snake_case_name.ts` where `NNN` is a zero-padded
  sequential number.
- **Exported symbol:** `migration` (singular).
- **`id` field:** must equal the filename minus `.ts`. The runner validates
  this.
- **`description`:** one sentence, present tense, what it changes. Shown in
  `migrate:status`.

## What NOT to do

- **No down migrations.** Schemaless rollbacks are brittle. Roll forward.
- **No import between migrations.** Each migration is self-contained. If you
  need shared logic, put it in a regular module under `server/src/` and import
  that.
- **No global state changes.** Migrations should only touch repo data, not
  env, files, or external services.
- **No schema lookups in app code that bypass `models.ts`.** The TypeScript
  types are the contract; if your code reads a doc and assumes a field that's
  not in the type, you have an undocumented schema.

## Testing migrations

Unit-test a migration by setting up the "before" state in an in-memory `Keyv`
repo, calling `migration.up()`, and asserting the "after" state. The migration
runner is environment-agnostic, so tests don't need MongoDB. See existing
tests under `server/src/migrations/*.test.ts` for examples (or be the first to
add one).
