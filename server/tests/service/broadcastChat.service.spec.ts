import { beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  checkAndRecordSend,
  getSlowMode,
  resetForTests,
  setSlowMode,
} from "../../src/services/broadcastChat.service.ts";

const CHANNEL = "chan-1";
const USER = "u-1";

beforeEach(() => {
  resetForTests();
});

describe("rate limiting", () => {
  it("allows up to RATE_LIMIT_MAX messages within the window", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkAndRecordSend(CHANNEL, USER, i).ok).toBe(true);
    }
  });

  it("blocks the message that exceeds the cap", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkAndRecordSend(CHANNEL, USER, i);
    const decision = checkAndRecordSend(CHANNEL, USER, RATE_LIMIT_MAX);
    expect(decision).toMatchObject({ ok: false, reason: "rate-limit" });
  });

  it("allows again once the window has slid past the earlier sends", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkAndRecordSend(CHANNEL, USER, i);
    // Far enough out that every earlier send has aged out of the window.
    expect(checkAndRecordSend(CHANNEL, USER, RATE_LIMIT_WINDOW_MS + 10).ok).toBe(true);
  });

  it("tracks each (channel, user) pair independently", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkAndRecordSend(CHANNEL, USER, i);
    // A different sender in the same channel is unaffected.
    expect(checkAndRecordSend(CHANNEL, "u-2", RATE_LIMIT_MAX).ok).toBe(true);
  });
});

describe("slow mode", () => {
  it("is off by default", () => {
    expect(getSlowMode(CHANNEL)).toBe(0);
  });

  it("blocks a message sent before the interval elapses", () => {
    setSlowMode(CHANNEL, 5);
    expect(checkAndRecordSend(CHANNEL, USER, 0).ok).toBe(true);
    const decision = checkAndRecordSend(CHANNEL, USER, 2000);
    expect(decision).toMatchObject({ ok: false, reason: "slow-mode", retryAfterMs: 3000 });
  });

  it("allows a message once the interval has elapsed", () => {
    setSlowMode(CHANNEL, 5);
    checkAndRecordSend(CHANNEL, USER, 0);
    expect(checkAndRecordSend(CHANNEL, USER, 5000).ok).toBe(true);
  });

  it("can be disabled by setting it to 0", () => {
    setSlowMode(CHANNEL, 5);
    setSlowMode(CHANNEL, 0);
    expect(getSlowMode(CHANNEL)).toBe(0);
    checkAndRecordSend(CHANNEL, USER, 0);
    expect(checkAndRecordSend(CHANNEL, USER, 1).ok).toBe(true);
  });
});
