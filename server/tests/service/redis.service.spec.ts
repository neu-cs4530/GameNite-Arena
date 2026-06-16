import { afterEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
 * redis.ts reads REDIS_URL at import time and refuses to load without it.
 * These tests re-import the module under controlled env to exercise both the
 * missing-url guard and the self-signed TLS option helper.
 * ------------------------------------------------------------------------- */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("redis service config", () => {
  it("throws at import when REDIS_URL is not set", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.resetModules();
    await expect(import("../../src/services/redis.ts")).rejects.toThrow("Wrong URL");
  });

  it("adds rejectUnauthorized TLS options only for rediss:// urls", async () => {
    vi.stubEnv("REDIS_URL", "rediss://example:6380");
    vi.resetModules();
    const { redisTlsOptions } = await import("../../src/services/redis.ts");

    expect(redisTlsOptions("rediss://example:6380")).toEqual({
      tls: { rejectUnauthorized: false },
    });
    expect(redisTlsOptions("redis://example:6379")).toEqual({});
  });
});
