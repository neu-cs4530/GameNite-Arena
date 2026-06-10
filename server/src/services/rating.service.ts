import { type GameKey, type GuessState, type NimState } from "@gamenite/shared";
import { ratingKey, type GameRecord } from "../models.ts";
import { MatchRepo, RatingRepo } from "../repository.ts";
import { newRating, updateRating, type Glicko2Rating } from "./glicko2.service.ts";

/**
 * Looks up a player's current rating for a game, or a fresh default rating
 * (1500/350/0.06) if they haven't played a rated game yet.
 *
 * @param entityId - The player's user id.
 * @param gameKey - Which game's rating to look up.
 * @returns The player's current Glicko-2 rating.
 */
export async function getRating(entityId: string, gameKey: GameKey): Promise<Glicko2Rating> {
  const record = await RatingRepo.find(ratingKey({ entityType: "human", entityId, gameKey }));
  if (!record) return newRating();
  return { rating: record.rating, rd: record.rd, volatility: record.vol };
}

/**
 * Saves a player's updated rating and bumps their games-played count.
 *
 * @param entityId - The player's user id.
 * @param gameKey - Which game this rating is for.
 * @param rating - The new rating to store.
 */
async function saveRating(
  entityId: string,
  gameKey: GameKey,
  rating: Glicko2Rating,
): Promise<void> {
  const key = ratingKey({ entityType: "human", entityId, gameKey });
  const existing = await RatingRepo.find(key);

  await RatingRepo.set(key, {
    entityId,
    entityType: "human",
    gameKey,
    rating: rating.rating,
    rd: rating.rd,
    vol: rating.volatility,
    gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
    lastUpdatedAt: new Date().toISOString(),
  });
}

/**
 * Picks the winner of a finished 2-player game from its final state.
 *
 * @param gameKey - Which game was played.
 * @param state - The game's final state.
 * @param players - The two players' user ids, in player-index order.
 * @returns The winner's user id, or undefined for a draw.
 */
function getWinnerId(gameKey: GameKey, state: unknown, players: string[]): string | undefined {
  if (gameKey === "nim") {
    // misere nim: the player who didn't take the last object wins
    const { nextPlayer } = state as NimState;
    return players[nextPlayer];
  }

  // guess: closest to the secret wins; an exact tie is a draw
  const { secret, guesses } = state as GuessState;
  const diffs = guesses.map((guess) => Math.abs((guess ?? 0) - secret));
  const bestDiff = Math.min(...diffs);
  const winners = players.filter((_, index) => diffs[index] === bestDiff);

  return winners.length === 1 ? winners[0] : undefined;
}

/**
 * Updates both players' Glicko-2 ratings after a rated game finishes, and
 * records the result on the game's MatchRecord. Only 1v1 games are rated, so
 * this does nothing unless `game.players` has exactly two entries.
 *
 * @param game - The finished GameRecord (state and done already updated).
 * @param gameId - The id `game` is stored under (also the MatchRecord's id).
 */
export async function updateRatingsForGame(game: GameRecord, gameId: string): Promise<void> {
  if (game.players.length !== 2) return;

  const [playerA, playerB] = game.players;
  const winnerId = getWinnerId(game.type, game.state, game.players);
  const scoreA = winnerId === undefined ? 0.5 : winnerId === playerA ? 1 : 0;

  const ratingA = await getRating(playerA, game.type);
  const ratingB = await getRating(playerB, game.type);

  const newRatingA = updateRating(ratingA, [
    { opponentRating: ratingB.rating, opponentRd: ratingB.rd, score: scoreA },
  ]);
  const newRatingB = updateRating(ratingB, [
    { opponentRating: ratingA.rating, opponentRd: ratingA.rd, score: 1 - scoreA },
  ]);

  await saveRating(playerA, game.type, newRatingA);
  await saveRating(playerB, game.type, newRatingB);

  // record the result on the match's archival record, if it was created
  const match = await MatchRepo.find(gameId);
  if (match) {
    await MatchRepo.set(gameId, {
      ...match,
      result: {
        winnerId,
        outcome: winnerId === undefined ? "draw" : "win",
        ratingChanges: [
          { entityId: playerA, delta: newRatingA.rating - ratingA.rating },
          { entityId: playerB, delta: newRatingB.rating - ratingB.rating },
        ],
      },
    });
  }
}
