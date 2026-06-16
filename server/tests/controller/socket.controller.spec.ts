import { afterEach, describe, expect, it, vi } from "vitest";
import { logSocketError } from "../../src/controllers/socket.controller.ts";
import type { GameServerSocket } from "../../src/types.ts";

// Other controller specs mock logSocketError; this one tests it directly so
// both branches (Error vs. non-Error) are exercised.
const socket = { id: "sock-1" } as unknown as GameServerSocket;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logSocketError", () => {
  it("logs the message when given an Error", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSocketError(socket, new Error("boom"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('error message: "boom"'));
  });

  it("logs a JSON dump when given a non-Error value", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSocketError(socket, { code: 42 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("unexpected error"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("42"));
  });
});
