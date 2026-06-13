import { describe, expect, it } from "vitest";
import type { NimView, SafeUserInfo } from "@gamenite/shared";
import { deriveAiTake } from "./aiMoveFlash.ts";

const HUMAN: SafeUserInfo = { username: "u0", display: "You", createdAt: new Date() };
const MODEL: SafeUserInfo = {
  username: "dep-1",
  display: "Arena Sentinel v1",
  createdAt: new Date(),
  isAi: true,
};

const nim = (remaining: number, nextPlayer: number): NimView => ({ remaining, nextPlayer });

describe("deriveAiTake", () => {
  it("derives the take when an AI seat just moved", () => {
    // AI (seat 1) was to move at 18; the new view shows 16 — it took 2.
    expect(deriveAiTake(nim(18, 1), nim(16, 0), [HUMAN, MODEL])).toEqual({ take: 2, seat: 1 });
  });

  it("derives a game-ending take", () => {
    expect(deriveAiTake(nim(1, 0), nim(0, 1), [MODEL, HUMAN])).toEqual({ take: 1, seat: 0 });
  });

  it("returns null when the mover was human", () => {
    expect(deriveAiTake(nim(18, 0), nim(16, 1), [HUMAN, MODEL])).toBeNull();
  });

  it("returns null without a previous view", () => {
    expect(deriveAiTake(null, nim(16, 0), [HUMAN, MODEL])).toBeNull();
  });

  it("returns null when the pile did not shrink", () => {
    expect(deriveAiTake(nim(16, 1), nim(16, 1), [HUMAN, MODEL])).toBeNull();
    expect(deriveAiTake(nim(16, 1), nim(18, 0), [HUMAN, MODEL])).toBeNull();
  });

  it("returns null for an impossible delta", () => {
    expect(deriveAiTake(nim(21, 1), nim(16, 0), [HUMAN, MODEL])).toBeNull();
  });

  it("returns null when the mover seat is unknown", () => {
    expect(deriveAiTake(nim(18, 1), nim(16, 0), [HUMAN])).toBeNull();
  });
});
