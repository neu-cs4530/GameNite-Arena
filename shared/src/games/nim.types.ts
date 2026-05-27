import { z, ZodNumber } from "zod";

/**
 * The internal state of a Nim game needs to keep track of two facts: who is
 * playing next and how many objects are left.
 */
export interface NimState {
  remaining: number;
  nextPlayer: number;
}

/**
 * Nim is a perfect information game; everyone who is playing the game knows
 * everything there is to know about the game. Therefore, the NimView is the
 * same as the NimState.
 *
 * https://en.wikipedia.org/wiki/Perfect_information
 */
export type NimView = NimState;

/**
 * A move in Nim is an integer between 1 and 3, representing how many tokens
 * you take. The move is only valid if it is your turn.
 */
export type NimMove = z.infer<typeof zNimMove>;
export const zNimMove: ZodNumber = z.int().gte(1).lte(3);
