import { describe, expect, it, vi } from "vitest";
import { runPendingMigrations, type Migration } from "../../src/migrations/MigrationRunner.ts";

describe("runPendingMigrations", () => {
  it("logs and re-throws when up() throws a non-Error", async () => {
    const log = vi.fn();
    const up = vi.fn<() => Promise<void>>().mockRejectedValue("not-an-error");
    const m: Migration = {
      id: "test_string_throw",
      description: "d",
      up,
    };
    await expect(runPendingMigrations([m], log)).rejects.toBe("not-an-error");
    expect(log.mock.calls.flat().join(" ")).toContain("not-an-error");
  });
});
