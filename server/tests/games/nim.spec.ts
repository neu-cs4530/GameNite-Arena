import { describe, expect, it } from "vitest";
import { nimLogic } from "../../src/games/nim.ts";

describe(`Nim's start() logic`, () => {
  it("Should always start a 2 player game with player 0, and should set START_NIM_OBJECTS to 21", () => {
    expect(nimLogic.start(2)).toStrictEqual({ remaining: 21, nextPlayer: 0 });
  });
});

describe(`Nim's update() logic`, () => {
  it("Should reject a poorly-typed move", () => {
    expect(nimLogic.update({ remaining: 4, nextPlayer: 0 }, null, 0)).toBeNull();
  });
  it("Should reject moves that are out of the range 1 to 3", () => {
    expect(nimLogic.update({ remaining: 4, nextPlayer: 0 }, 0, 0)).toBeNull();
    expect(nimLogic.update({ remaining: 4, nextPlayer: 0 }, 4, 0)).toBeNull();
  });
  it("Should reject moves that take more pieces than are still remaining", () => {
    expect(nimLogic.update({ remaining: 2, nextPlayer: 0 }, 3, 0)).toBeNull();
    expect(nimLogic.update({ remaining: 1, nextPlayer: 0 }, 2, 0)).toBeNull();
    expect(nimLogic.update({ remaining: 0, nextPlayer: 0 }, 1, 0)).toBeNull();
  });
  it("Should reject the wrong player moving", () => {
    expect(nimLogic.update({ remaining: 4, nextPlayer: 1 }, 2, 0)).toBeNull();
  });
  it("Should allow all the remaining pieces to be taken", () => {
    expect(nimLogic.update({ remaining: 3, nextPlayer: 0 }, 3, 0)).toStrictEqual({
      remaining: 0,
      nextPlayer: 1,
    });
    expect(nimLogic.update({ remaining: 2, nextPlayer: 0 }, 2, 0)).toStrictEqual({
      remaining: 0,
      nextPlayer: 1,
    });
    expect(nimLogic.update({ remaining: 1, nextPlayer: 0 }, 1, 0)).toStrictEqual({
      remaining: 0,
      nextPlayer: 1,
    });
  });
  it("Should allow fewer than all the remaining pieces to be taken", () => {
    expect(nimLogic.update({ remaining: 15, nextPlayer: 1 }, 3, 1)).toStrictEqual({
      remaining: 12,
      nextPlayer: 0,
    });
  });
});

describe(`Nim's isDone() logic`, () => {
  it("Should say that only a game with no objects left is done", () => {
    expect(nimLogic.isDone({ remaining: 0, nextPlayer: 0 })).toBe(true);
    expect(nimLogic.isDone({ remaining: 15, nextPlayer: 0 })).toBe(false);
  });
});

describe(`Nim's viewAs() logic`, () => {
  it("Should view games the same way regardless of who is viewing", () => {
    expect(nimLogic.viewAs({ remaining: 3, nextPlayer: 0 }, -1)).toStrictEqual({
      remaining: 3,
      nextPlayer: 0,
    });
    expect(nimLogic.viewAs({ remaining: 3, nextPlayer: 0 }, 0)).toStrictEqual({
      remaining: 3,
      nextPlayer: 0,
    });
    expect(nimLogic.viewAs({ remaining: 3, nextPlayer: 0 }, 1)).toStrictEqual({
      remaining: 3,
      nextPlayer: 0,
    });
  });
});

describe(`Nim's tagView() logic`, () => {
  it("Should appropriately tag the view", () => {
    expect(nimLogic.tagView({ remaining: 3, nextPlayer: 0 })).toStrictEqual({
      type: "nim",
      view: { remaining: 3, nextPlayer: 0 },
    });
  });
});
