import { z, ZodNumber } from "zod";

/**
 * The internal state of the guessing game is both the number (a secret that
 * everyone is trying to guess), and a list of all the guesses that have
 * been made so far.
 */
export interface GuessState {
  secret: number;
  guesses: (number | null)[];
}

/**
 * Before a game has finished, it's only possible to see your own guess
 * (if you're playing and you've made a guess) and whether other players have
 * also guessed.
 */
export type UnfinishedGuessView = {
  finished: false;
  guesses: boolean[];
  myGuess?: number;
};

/**
 * After a game has finished, the secret and everyone's guesses are all
 * visible to everyone.
 */
export type FinishedGuessView = {
  finished: true;
  secret: number;
  guesses: number[];
};

/**
 * The player's view of a guessing game depends on whether the game has
 * finished (whether all players have guessed) or not.
 */
export type GuessView = UnfinishedGuessView | FinishedGuessView;

/**
 * A move in the guessing game is an integer is an integer between 1 and 100,
 * representing your guess. You can only guess if you haven't guessed yet,
 * but everyone can guess in any order.
 */
export type GuessMove = z.infer<typeof zGuessMove>;
export const zGuessMove: ZodNumber = z.int().gte(1).lte(100);
