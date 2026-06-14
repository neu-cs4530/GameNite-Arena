import { describe, expect, it } from "vitest";
import {
  clampRequeueLimit,
  defaultMatchSettings,
  matchSettingsKey,
  parseMatchSettings,
  serializeMatchSettings,
} from "./matchSettings.ts";

/**
 * Per-game match settings (auto-requeue) persist in localStorage, which
 * means every read crosses a trust boundary: other tabs, older builds, or
 * hand-edited values. The parser must therefore be total — any garbage
 * degrades to the defaults, never to a crash or an out-of-range limit.
 */

describe("matchSettingsKey", () => {
  it("namespaces per game under the gnarena prefix", () => {
    expect(matchSettingsKey("nim")).toBe("gnarena:matchSettings:nim");
    expect(matchSettingsKey("guess")).toBe("gnarena:matchSettings:guess");
  });
});

describe("defaults", () => {
  it("auto-requeue starts off with no cap selected", () => {
    expect(defaultMatchSettings).toEqual({ autoRequeue: false, requeueLimit: 0 });
  });
});

describe("clampRequeueLimit", () => {
  it("passes through the allowed values", () => {
    expect(clampRequeueLimit(0)).toBe(0);
    expect(clampRequeueLimit(3)).toBe(3);
    expect(clampRequeueLimit(5)).toBe(5);
    expect(clampRequeueLimit(10)).toBe(10);
  });

  it("clamps in-between values down to the nearest allowed option", () => {
    expect(clampRequeueLimit(4)).toBe(3);
    expect(clampRequeueLimit(7)).toBe(5);
    expect(clampRequeueLimit(100)).toBe(10);
  });

  it("treats negative, fractional and non-numeric input as off", () => {
    expect(clampRequeueLimit(-3)).toBe(0);
    expect(clampRequeueLimit(2.9)).toBe(0);
    expect(clampRequeueLimit(Number.NaN)).toBe(0);
    expect(clampRequeueLimit("5")).toBe(0);
  });
});

describe("parse / serialize round trip", () => {
  it("round-trips a real settings object", () => {
    const settings = { autoRequeue: true, requeueLimit: 5 as const };
    expect(parseMatchSettings(serializeMatchSettings(settings))).toEqual(settings);
  });

  it("defaults when nothing is stored", () => {
    expect(parseMatchSettings(null)).toEqual(defaultMatchSettings);
  });

  it("defaults on garbled JSON", () => {
    expect(parseMatchSettings("{nope")).toEqual(defaultMatchSettings);
    expect(parseMatchSettings('"just a string"')).toEqual(defaultMatchSettings);
  });

  it("coerces a tampered limit back into range and a non-boolean toggle to off", () => {
    expect(parseMatchSettings('{"autoRequeue":true,"requeueLimit":7}')).toEqual({
      autoRequeue: true,
      requeueLimit: 5,
    });
    expect(parseMatchSettings('{"autoRequeue":"yes","requeueLimit":3}')).toEqual({
      autoRequeue: false,
      requeueLimit: 3,
    });
  });
});
