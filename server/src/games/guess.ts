import {
  zGuessMove,
  type GuessView,
  type GuessState,
  type UnfinishedGuessView,
} from "@gamenite/shared";
import { GameService } from "./gameServiceManager.ts";
import { type GameLogic } from "./gameLogic.ts";

function allGuessed(guesses: (number | null)[]): guesses is number[] {
  return guesses.every((guess) => guess !== null);
}

export const guessLogic: GameLogic<GuessState, GuessView> = {
  minPlayers: 2,
  maxPlayers: null,
  start: (numPlayers) => ({
    secret: Math.round(Math.random() * 100) + 1,
    guesses: Array.from({ length: numPlayers }).map(() => null),
  }),
  update: ({ secret, guesses: oldGuesses }, payload, playerIndex) => {
    const move = zGuessMove.safeParse(payload);
    if (oldGuesses[playerIndex] !== null) return null;
    if (move.error) return null;
    const newGuesses = [...oldGuesses];
    newGuesses[playerIndex] = move.data;
    return {
      secret,
      guesses: newGuesses,
    };
  },
  isDone: ({ guesses }) => guesses.every((guess) => guess !== null),
  viewAs: ({ secret, guesses }, playerIndex) => {
    if (allGuessed(guesses)) {
      return { finished: true, secret, guesses };
    }
    // If the game is not done, we only show the player their own guess
    // everyone can see *who* has guessed
    const view: UnfinishedGuessView = {
      finished: false,
      guesses: guesses.map((value) => value !== null),
    };
    if (playerIndex !== -1 && guesses[playerIndex] !== null) {
      view.myGuess = guesses[playerIndex];
    }
    return view;
  },
  tagView: (view) => ({ type: "guess", view }),
  // The closest guess to the secret wins (matches the client GuessGame
  // "best guess" crown). If two or more players tie for closest, the game is
  // a draw (null). Only called when isDone(state) is true, so every guess is
  // non-null here.
  winnerIndex: ({ secret, guesses }) => {
    if (!allGuessed(guesses)) return null;
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    guesses.forEach((guess, index) => {
      const distance = Math.abs(guess - secret);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      } else if (distance === bestDistance) {
        best = null;
      }
    });
    return best;
  },
  parseMove: (payload) => {
    const move = zGuessMove.safeParse(payload);
    return move.success ? move.data : null;
  },
};

export const guessGameService = new GameService<GuessState, GuessView>(guessLogic);
