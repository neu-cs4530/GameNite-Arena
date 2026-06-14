import {
  type AnalysisMoveResult,
  type AnalysisResult,
  type GuessState,
  type NimState,
} from "@gamenite/shared";
import { type MatchRecord } from "../models.ts";
import { DeploymentRepo, MatchRepo } from "../repository.ts";
import * as inferenceClient from "./inferenceClient.ts";

const NIM_START_OBJECTS = 21;

// in misere nim (take 1-3), leaving the opponent at remaining % 4 === 1
// always loses for them. if we're already at that point, no move helps.
function nimWinningTake(remaining: number): number | null {
  const take = (remaining - 1) % 4;
  return take === 0 ? null : take;
}

// best-effort: make sure the model behind deploymentId is loaded into
// inference before we start asking it for moves.
async function ensureLoaded(deploymentId: string | undefined): Promise<void> {
  if (!deploymentId) return;
  try {
    const deployment = await DeploymentRepo.find(deploymentId);
    if (!deployment) return;
    await inferenceClient.loadModel({
      deploymentId,
      game: deployment.gameKey,
      modelId: deployment.modelId,
    });
  } catch {
    // requestMove below will just fail too if this didn't work.
  }
}

// best-effort: skip if there's no deploymentId or inference is unreachable.
async function getEngineMove(deploymentId: string | undefined, state: unknown): Promise<unknown> {
  if (!deploymentId) return undefined;
  try {
    const { move } = (await inferenceClient.requestMove({ deploymentId, state })) as {
      move: unknown;
    };
    return move;
  } catch {
    return undefined;
  }
}

async function analyzeNim(
  record: MatchRecord,
  deploymentId?: string,
): Promise<AnalysisMoveResult[]> {
  const initial = record.initialState as NimState | undefined;
  let remaining = initial?.remaining ?? NIM_START_OBJECTS;

  const perMove: AnalysisMoveResult[] = [];
  for (const [moveIndex, m] of record.moves.entries()) {
    const playerMove = m.move as number;
    const winningTake = nimWinningTake(remaining);

    let result: AnalysisMoveResult;
    if (winningTake === null) {
      result = {
        moveIndex,
        flag: "neutral",
        confidence: 1,
        notes: "Already a lost position - no move avoids leaving a winning pile.",
      };
    } else if (playerMove === winningTake) {
      result = { moveIndex, flag: "best", confidence: 1 };
    } else {
      result = {
        moveIndex,
        flag: "blunder",
        confidence: 1,
        notes: `Taking ${winningTake} would have left the opponent a losing pile.`,
        suggestedMove: winningTake,
      };
    }

    const engineMove = await getEngineMove(deploymentId, { remaining });
    if (engineMove !== undefined) result.engineMove = engineMove;

    remaining -= playerMove;
    perMove.push(result);
  }
  return perMove;
}

// no positional info before the secret is revealed, so the "best" move is
// just whichever guess ended up closest to it.
async function analyzeGuess(
  record: MatchRecord,
  deploymentId?: string,
): Promise<AnalysisMoveResult[]> {
  const secret = (record.initialState as GuessState | undefined)?.secret;

  const perMove: AnalysisMoveResult[] = [];
  if (secret === undefined) {
    for (const moveIndex of record.moves.keys()) {
      const result: AnalysisMoveResult = { moveIndex, flag: "neutral", confidence: 0 };
      const engineMove = await getEngineMove(deploymentId, { low: 1, high: 100 });
      if (engineMove !== undefined) result.engineMove = engineMove;
      perMove.push(result);
    }
    return perMove;
  }

  const distances = record.moves.map((m) => Math.abs((m.move as number) - secret));
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  for (const [moveIndex, m] of record.moves.entries()) {
    const guess = m.move as number;
    const distance = distances[moveIndex];

    let flag: AnalysisMoveResult["flag"] = "neutral";
    if (minDistance !== maxDistance) {
      if (distance === minDistance) flag = "best";
      else if (distance === maxDistance) flag = "inaccuracy";
    }

    const result: AnalysisMoveResult = {
      moveIndex,
      flag,
      confidence: 1,
      notes: `The secret was ${secret} - this guess was off by ${distance}.`,
      suggestedMove: guess === secret ? undefined : secret,
    };
    const engineMove = await getEngineMove(deploymentId, { low: 1, high: 100 });
    if (engineMove !== undefined) result.engineMove = engineMove;
    perMove.push(result);
  }
  return perMove;
}

/**
 * @param matchId - the match to analyze
 * @param deploymentId - optional loaded model to also ask for its move
 * @returns per-move engine flags, or null if no match with this id exists
 */
export async function analyzeReplay(
  matchId: string,
  deploymentId?: string,
): Promise<AnalysisResult | null> {
  const record = await MatchRepo.find(matchId);
  if (!record) return null;

  await ensureLoaded(deploymentId);

  const perMove =
    record.gameKey === "nim"
      ? await analyzeNim(record, deploymentId)
      : await analyzeGuess(record, deploymentId);

  return { matchId, generatedAt: new Date().toISOString(), perMove };
}
