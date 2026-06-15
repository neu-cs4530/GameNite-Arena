import { describe, expect, it } from "vitest";
import { redisTlsOptions } from "../../src/services/redis.ts";

describe("redisTlsOptions", () => {
  it("relaxes cert verification for a self-signed rediss:// endpoint", () => {
    expect(redisTlsOptions("rediss://default:pw@redis.example.com:6380")).toEqual({
      tls: { rejectUnauthorized: false },
    });
  });

  it("adds no TLS options for a plaintext redis:// endpoint", () => {
    expect(redisTlsOptions("redis://localhost:6379")).toEqual({});
  });
});
