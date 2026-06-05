import { beforeEach, describe, expect, it } from "vitest";
import { MigrationLogRepo } from "../repository.ts";
import {
  type Migration,
  getMigrationStatus,
  loadAllMigrations,
  runPendingMigrations,
} from "./MigrationRunner.ts";

const silent = (_msg: string): void => {};

describe("MigrationRunner", () => {
  beforeEach(async () => {
    await MigrationLogRepo.clear();
  });

  it("applies a pending migration and records it", async () => {
    let upRan = 0;
    const m: Migration = {
      id: "999_test_one",
      description: "test migration",
      up: async () => {
        await Promise.resolve();
        upRan += 1;
      },
    };

    const result = await runPendingMigrations([m], silent);
    expect(result.applied).toEqual(["999_test_one"]);
    expect(result.skipped).toEqual([]);
    expect(upRan).toBe(1);

    const log = await MigrationLogRepo.find("999_test_one");
    expect(log).toBeTruthy();
    expect(log?.id).toBe("999_test_one");
    expect(log?.description).toBe("test migration");
  });

  it("skips a migration already in the log on a second run", async () => {
    let upRan = 0;
    const m: Migration = {
      id: "999_test_two",
      description: "test migration",
      up: async () => {
        await Promise.resolve();
        upRan += 1;
      },
    };

    await runPendingMigrations([m], silent);
    const second = await runPendingMigrations([m], silent);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["999_test_two"]);
    expect(upRan).toBe(1);
  });

  it("runs multiple migrations in id order", async () => {
    const order: string[] = [];
    const push = (label: string) => async (): Promise<void> => {
      await Promise.resolve();
      order.push(label);
    };
    const ms: Migration[] = [
      { id: "999_test_b", description: "b", up: push("b") },
      { id: "999_test_a", description: "a", up: push("a") },
      { id: "999_test_c", description: "c", up: push("c") },
    ];
    ms.sort((x, y) => x.id.localeCompare(y.id));
    await runPendingMigrations(ms, silent);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("does not record a migration whose up() throws", async () => {
    const m: Migration = {
      id: "999_test_failing",
      description: "fails on purpose",
      up: async () => {
        await Promise.resolve();
        throw new Error("boom");
      },
    };

    await expect(runPendingMigrations([m], silent)).rejects.toThrow("boom");
    const log = await MigrationLogRepo.find("999_test_failing");
    expect(log).toBeNull();
  });

  it("status correctly splits applied vs pending", async () => {
    const noop = async (): Promise<void> => Promise.resolve();
    const applied: Migration = {
      id: "999_status_one",
      description: "applied one",
      up: noop,
    };
    const pending: Migration = {
      id: "999_status_two",
      description: "pending one",
      up: noop,
    };

    await runPendingMigrations([applied], silent);

    const status = await getMigrationStatus([applied, pending]);
    expect(status.applied.map((a) => a.id)).toEqual(["999_status_one"]);
    expect(status.pending.map((p) => p.id)).toEqual(["999_status_two"]);
  });

  it("discovers real migration files from the migrations directory", async () => {
    const migrations = await loadAllMigrations();
    const ids = migrations.map((m) => m.id);
    expect(ids).toContain("000_sprint1_arena_baseline");
    expect(ids).toEqual([...ids].sort());
  });
});
