import { describe, expect, it } from "vitest";
import { analysisCapabilities } from "./analysisCapabilities.ts";

describe("analysisCapabilities", () => {
  it("offers the built-in engine only for closed-form games", () => {
    expect(analysisCapabilities("nim", false).engine).toBe(true);
    expect(analysisCapabilities("tictactoe", false).engine).toBe(true);
    expect(analysisCapabilities("connect4", false).engine).toBe(false);
    expect(analysisCapabilities("checkers", false).engine).toBe(false);
    expect(analysisCapabilities("guess", false).engine).toBe(false);
  });

  it("offers AI insight only when the user has an eligible model", () => {
    expect(analysisCapabilities("connect4", true).ai).toBe(true);
    expect(analysisCapabilities("connect4", false).ai).toBe(false);
  });

  it("a closed-form game with a deployed model offers both", () => {
    expect(analysisCapabilities("nim", true)).toStrictEqual({ engine: true, ai: true });
  });

  it("a non-engine game with no model offers nothing", () => {
    expect(analysisCapabilities("guess", false)).toStrictEqual({ engine: false, ai: false });
    expect(analysisCapabilities("checkers", false)).toStrictEqual({ engine: false, ai: false });
  });
});
