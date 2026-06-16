import { describe, expect, it } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import {
  delay,
  isFallbackEligible,
  isNetworkOrServerError,
  isNotFound,
} from "./serviceFallback.ts";

// Small helper so each test can build an AxiosError with the status it cares
// about. A `status` of undefined means "no response at all" (a network
// failure), which the helpers treat differently from a real HTTP status.
function axiosError(status?: number): AxiosError {
  const response =
    status === undefined
      ? undefined
      : ({ status, statusText: "", headers: {}, config: {}, data: {} } as AxiosResponse);
  return new AxiosError("boom", "ERR", undefined, null, response);
}

describe("serviceFallback.isNotFound", () => {
  it("is true only for an Axios 404", () => {
    expect(isNotFound(axiosError(404))).toBe(true);
  });

  it("is false for other Axios statuses", () => {
    expect(isNotFound(axiosError(500))).toBe(false);
  });

  it("is false for a plain (non-Axios) error", () => {
    expect(isNotFound(new Error("nope"))).toBe(false);
  });
});

describe("serviceFallback.isNetworkOrServerError", () => {
  it("is true for a non-Axios error (transport layer, not app logic)", () => {
    expect(isNetworkOrServerError(new Error("network down"))).toBe(true);
  });

  it("is true for an Axios error with no response (no server)", () => {
    expect(isNetworkOrServerError(axiosError(undefined))).toBe(true);
  });

  it("is true for a 5xx but false for a 4xx", () => {
    expect(isNetworkOrServerError(axiosError(503))).toBe(true);
    expect(isNetworkOrServerError(axiosError(400))).toBe(false);
  });
});

describe("serviceFallback.isFallbackEligible", () => {
  it("is true for a 404 and for a server error", () => {
    expect(isFallbackEligible(axiosError(404))).toBe(true);
    expect(isFallbackEligible(axiosError(500))).toBe(true);
  });

  it("is false for a meaningful 4xx (e.g. validation error)", () => {
    expect(isFallbackEligible(axiosError(422))).toBe(false);
  });
});

describe("serviceFallback.delay", () => {
  it("resolves with the same value it was given", async () => {
    await expect(delay("hello", 0)).resolves.toBe("hello");
  });
});
