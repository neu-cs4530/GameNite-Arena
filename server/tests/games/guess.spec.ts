import { describe, expect, it } from "vitest";
import { guessLogic } from "../../src/games/guess.ts";

describe(`Guessing game's start() logic`, () => {
  it("Should always start a game with the provided number of players", () => {
    expect(guessLogic.start(2)).toStrictEqual({ secret: expect.anything(), guesses: [null, null] });
    expect(guessLogic.start(4)).toStrictEqual({
      secret: expect.anything(),
      guesses: [null, null, null, null],
    });
  });
});

describe(`Guessing game's update() logic`, () => {
  it("Should reject a poorly-typed move", () => {
    expect(
      guessLogic.update({ secret: expect.anything(), guesses: [null, null, null] }, null, 0),
    ).toBeNull();
  });
  it("Should reject moves that are out of range 1 to 100", () => {
    expect(guessLogic.update({ secret: 44, guesses: [null, null, null] }, 0, 0)).toBeNull();
    expect(guessLogic.update({ secret: 44, guesses: [null, null, null] }, 101, 0)).toBeNull();
  });
  it("Forbids guessing twice", () => {
    expect(guessLogic.update({ secret: 44, guesses: [null, null, 22] }, 10, 2)).toBeNull();
    expect(guessLogic.update({ secret: 44, guesses: [null, null, 22] }, 22, 2)).toBeNull();
  });
  it("Should accept in-range moves and update the correct player", () => {
    expect(guessLogic.update({ secret: 44, guesses: [null, null, null] }, 10, 0)).toStrictEqual({
      secret: 44,
      guesses: [10, null, null],
    });
    expect(guessLogic.update({ secret: 44, guesses: [null, null, 90] }, 20, 1)).toStrictEqual({
      secret: 44,
      guesses: [null, 20, 90],
    });
    expect(guessLogic.update({ secret: 44, guesses: [99, 98, null] }, 20, 2)).toStrictEqual({
      secret: 44,
      guesses: [99, 98, 20],
    });
  });
});

describe(`Guessing game's isDone() logic`, () => {
  it("Should only claim to be done if everyone has guessed", () => {
    expect(guessLogic.isDone({ secret: 44, guesses: [null, null, null] })).toBe(false);
    expect(guessLogic.isDone({ secret: 44, guesses: [null, 10, null] })).toBe(false);
    expect(guessLogic.isDone({ secret: 44, guesses: [30, null, null] })).toBe(false);
    expect(guessLogic.isDone({ secret: 44, guesses: [null, 99, 4] })).toBe(false);
    expect(guessLogic.isDone({ secret: 44, guesses: [3, 99, 4] })).toBe(true);
  });
});

describe(`Guessing game's viewAs() logic`, () => {
  it("Should include only who has guessed for anonymous viewers, unless finished", () => {
    expect(guessLogic.viewAs({ secret: 44, guesses: [null, null, 33] }, -1)).toStrictEqual({
      finished: false,
      guesses: [false, false, true],
    });
    expect(guessLogic.viewAs({ secret: 44, guesses: [1, 2, 33] }, -1)).toStrictEqual({
      finished: true,
      secret: 44,
      guesses: [1, 2, 33],
    });
  });
  it("Should include the current player guess, if any, unless finished", () => {
    expect(guessLogic.viewAs({ secret: 44, guesses: [7, null, 33] }, 1)).toStrictEqual({
      finished: false,
      guesses: [true, false, true],
    });
    expect(guessLogic.viewAs({ secret: 44, guesses: [null, null, 33] }, 2)).toStrictEqual({
      finished: false,
      guesses: [false, false, true],
      myGuess: 33,
    });
    expect(guessLogic.viewAs({ secret: 44, guesses: [7, 6, 33] }, 0)).toStrictEqual({
      finished: true,
      secret: 44,
      guesses: [7, 6, 33],
    });
  });
});

describe(`Guessing game's tagView() logic`, () => {
  it("Should appropriately tag the view", () => {
    expect(guessLogic.tagView({ finished: true, secret: 12, guesses: [1, 2, 3] })).toStrictEqual({
      type: "guess",
      view: { finished: true, secret: 12, guesses: [1, 2, 3] },
    });
  });
});
