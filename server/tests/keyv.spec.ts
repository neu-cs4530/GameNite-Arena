import { describe, expect, it, vi } from "vitest";
import { createRepo, setDbInitializer } from "../src/keyv.ts";

// Each test gets a fresh module because setDbInitializer has global state —
// but since we can't easily reset the module between tests, we rely on the
// fact that every test uses a *distinct* repo name so the lazy _store
// initialization per-repo doesn't bleed between tests.

describe("createRepo — add / set / get / find", () => {
  it("add() returns a key and get() retrieves the value", async () => {
    const repo = createRepo<string>("kv-test-add");
    const key = await repo.add("hello");
    expect(typeof key).toBe("string");
    expect(await repo.get(key)).toBe("hello");
  });

  it("set() then get() round-trips an object value", async () => {
    const repo = createRepo<{ x: number }>("kv-test-set");
    await repo.set("k1", { x: 42 });
    expect(await repo.get("k1")).toEqual({ x: 42 });
  });

  it("find() returns null for a missing key", async () => {
    const repo = createRepo<string>("kv-test-find");
    expect(await repo.find("no-such-key")).toBeNull();
  });

  it("find() returns the value for an existing key", async () => {
    const repo = createRepo<number>("kv-test-find2");
    await repo.set("num", 99);
    expect(await repo.find("num")).toBe(99);
  });

  it("get() throws for a missing key", async () => {
    const repo = createRepo<string>("kv-test-get-missing");
    await expect(repo.get("ghost")).rejects.toThrow();
  });
});

describe("createRepo — getMany", () => {
  it("returns values in key order", async () => {
    const repo = createRepo<number>("kv-test-getmany");
    await repo.set("a", 1);
    await repo.set("b", 2);
    await repo.set("c", 3);
    const result = await repo.getMany(["c", "a", "b"]);
    expect(result).toEqual([3, 1, 2]);
  });

  it("throws when a key is undefined in the store", async () => {
    const repo = createRepo<number>("kv-test-getmany-missing");
    await repo.set("x", 10);
    await expect(repo.getMany(["x", "missing"])).rejects.toThrow();
  });
});

describe("createRepo — getAllKeys", () => {
  it("returns all keys after multiple sets", async () => {
    const repo = createRepo<string>("kv-test-keys");
    await repo.set("foo", "a");
    await repo.set("bar", "b");
    const keys = await repo.getAllKeys();
    expect(keys).toContain("foo");
    expect(keys).toContain("bar");
  });
});

describe("createRepo — clear", () => {
  it("empties the store so getAllKeys returns []", async () => {
    const repo = createRepo<string>("kv-test-clear");
    await repo.set("z", "val");
    await repo.clear();
    expect(await repo.getAllKeys()).toHaveLength(0);
  });

  it("clear() is a no-op before the store is ever accessed", async () => {
    // _store starts as null; clear() should not throw.
    const repo = createRepo<string>("kv-test-clear-noop");
    await expect(repo.clear()).resolves.toBeUndefined();
  });
});

describe("createRepo — custom initializer + store-write failures", () => {
  it("uses a freshly-set initializer and surfaces store.set() failures", async () => {
    // Reset the module so globalDbInitializer is null again, then set a custom
    // initializer (exercises setDbInitializer's first-set branch) backed by a
    // store whose set() always reports failure (exercises the add/set throws).
    vi.resetModules();
    const fresh = await import("../src/keyv.ts");
    const failingStore = {
      set: () => Promise.resolve(false),
      get: () => Promise.resolve(undefined),
    };
    fresh.setDbInitializer(() => failingStore as never);

    const repo = fresh.createRepo<string>("kv-failing-store");
    await expect(repo.add("x")).rejects.toThrow(/Failed to set new key/);
    await expect(repo.set("k", "v")).rejects.toThrow(/Failed to set key/);

    vi.resetModules();
  });
});

describe("setDbInitializer", () => {
  it("throws when called a second time", () => {
    // The module-level globalDbInitializer may or may not have been set by
    // earlier tests; what matters is that a *second* call always throws.
    // We exercise this by importing a fresh createRepo (the first call to
    // setDbInitializer in this process was made implicitly by any prior
    // createRepo call, so we just call it again and expect the throw).
    expect(() =>
      setDbInitializer((_name) => ({ get: () => Promise.resolve(undefined) }) as never),
    ).toThrow("Database initializer cannot be set a second time");
  });
});
