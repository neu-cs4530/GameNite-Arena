import { describe, expect, it } from "vitest";
import {
  newRating,
  isProvisional,
  updateRating,
  DEFAULT_RATING,
  DEFAULT_RD,
  PROVISIONAL_THRESHOLD,
} from "../../src/services/glicko2.service.ts";

describe("newRating", () => {
  it("should return default values when no overrides given", () => {
    const r = newRating();
    expect(r.rating).toBe(DEFAULT_RATING);
    expect(r.rd).toBe(DEFAULT_RD);
  });

  it("should apply overrides", () => {
    const r = newRating({ rating: 1600, rd: 100 });
    expect(r.rating).toBe(1600);
    expect(r.rd).toBe(100);
  });
});

describe("isProvisional", () => {
  it("should return true when RD is above the threshold", () => {
    expect(isProvisional(newRating())).toBe(true);
  });

  it("should return false when RD is below the threshold", () => {
    expect(isProvisional(newRating({ rd: PROVISIONAL_THRESHOLD - 1 }))).toBe(false);
  });
});

describe("updateRating", () => {
  // inactive players still have their RD drift up — Elo can't do this
  it("should increase RD when no games are played", () => {
    const player = newRating({ rating: 1800, rd: 60 });
    const updated = updateRating(player, []);
    expect(updated.rd).toBeGreaterThan(player.rd);
    expect(updated.rating).toBe(player.rating);
  });

  it("should not let RD exceed 350 from inactivity alone", () => {
    const player = newRating({ rd: 349 });
    const updated = updateRating(player, []);
    expect(updated.rd).toBeLessThanOrEqual(DEFAULT_RD);
  });

  it("should increase rating on a win", () => {
    const player = newRating();
    const updated = updateRating(player, [{ opponentRating: 1500, opponentRd: 100, score: 1.0 }]);
    expect(updated.rating).toBeGreaterThan(player.rating);
  });

  it("should decrease rating on a loss", () => {
    const player = newRating();
    const updated = updateRating(player, [{ opponentRating: 1500, opponentRd: 100, score: 0.0 }]);
    expect(updated.rating).toBeLessThan(player.rating);
  });

  it("should decrease RD after playing games", () => {
    const player = newRating();
    const updated = updateRating(player, [{ opponentRating: 1500, opponentRd: 100, score: 0.5 }]);
    expect(updated.rd).toBeLessThan(player.rd);
  });

  it("should drop RD further with more games played", () => {
    const player = newRating();
    const opponent = { opponentRating: 1500, opponentRd: 100, score: 0.5 };
    const oneGame = updateRating(player, [opponent]);
    const tenGames = updateRating(player, Array.from({ length: 10 }, () => opponent));
    expect(tenGames.rd).toBeLessThan(oneGame.rd);
  });

  it("should move rating more for a provisional player than an established one", () => {
    const result = { opponentRating: 1600, opponentRd: 50, score: 1.0 };
    const highRd = updateRating(newRating({ rd: 350 }), [result]);
    const lowRd = updateRating(newRating({ rd: 50 }), [result]);
    expect(Math.abs(highRd.rating - DEFAULT_RATING)).toBeGreaterThan(
      Math.abs(lowRd.rating - DEFAULT_RATING),
    );
  });

  it("should give more rating for beating a well-established opponent", () => {
    const player = newRating({ rd: 100 });
    const vsShaky = updateRating(player, [{ opponentRating: 1600, opponentRd: 300, score: 1.0 }]);
    const vsSolid = updateRating(player, [{ opponentRating: 1600, opponentRd: 50, score: 1.0 }]);
    expect(vsSolid.rating).toBeGreaterThan(vsShaky.rating);
  });
});
