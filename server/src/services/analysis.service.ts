import {
  ENGINE_SOLVABLE_GAME_KEYS,
  type AnalysisMoveResult,
  type AnalysisResult,
  type GameKey,
} from "@gamenite/shared";
import { type MatchRecord } from "../models.ts";
import { checkersGameService } from "../games/checkers.ts";
import { DeploymentRepo, MatchRepo } from "../repository.ts";
import { encodeStateForInference, gameServices } from "./game.service.ts";
import { analyzeClosedFormMove } from "./replayEngine.ts";
import * as inferenceClient from "./inferenceClient.ts";

// best-effort: make sure the model behind deploymentId is loaded into
// inference before we start asking it for moves. A real failure surfaces (and
// is reported) from the requestMove pass below.
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
    // requestMove will surface and report any real failure.
  }
}

/**
 * Rebuild the position BEFORE each move by replaying the archived moves through
 * the game's own logic, so both the engine and the inference model see the
 * exact state the player faced. Falls back to the game's canonical start when
 * the archive didn't snapshot an initial state.
 */
function reconstructStates(record: MatchRecord): unknown[] {
  const service = gameServices[record.gameKey];
  let state: unknown =
    record.initialState !== undefined && record.initialState !== null
      ? record.initialState
      : service.create(["p0", "p1"]).state;

  const states: unknown[] = [];
  for (const m of record.moves) {
    states.push(state);
    const nextPlayer = (state as { nextPlayer?: number }).nextPlayer ?? 0;
    const updated = service.update(state, m.move, nextPlayer, ["p0", "p1"]);
    state = updated ? updated.state : state;
  }
  return states;
}

function describeInferenceFailure(err: unknown): string {
  if (err instanceof inferenceClient.InferenceError) {
    if (err.status === 503) return "The inference service is unreachable right now.";
    if (err.status === 404) return "That model isn't available for inference.";
    return err.message;
  }
  return "The model could not be run.";
}

function checkersLegalMoves(state: unknown): unknown[] {
  const tagged = checkersGameService.view(state, -1) as { view?: { legalMoves?: unknown[] } };
  return tagged.view?.legalMoves ?? [];
}

/**
 * Ask the deployed model for its move at each reconstructed position. These are
 * real reached states, so a failure here is environmental (service down, model
 * not loadable, game unsupported) and all-or-nothing — stop on the first error
 * and report it, rather than silently degrading every move to "no insight".
 */
async function collectModelMoves(
  deploymentId: string,
  gameKey: GameKey,
  states: unknown[],
): Promise<{ moves: unknown[]; error?: string }> {
  const moves: unknown[] = [];
  for (const state of states) {
    try {
      const legalMoves = gameKey === "checkers" ? checkersLegalMoves(state) : undefined;
      const { move } = (await inferenceClient.requestMove({
        deploymentId,
        state: encodeStateForInference(gameKey, state),
        legalMoves,
      })) as { move: unknown };
      moves.push(move);
    } catch (err) {
      return { moves, error: describeInferenceFailure(err) };
    }
  }
  return { moves };
}

/**
 * Per-move analysis of an archived match: the built-in perfect-play engine's
 * verdict (best / blunder / inaccuracy plus the best line) for games with a
 * closed-form engine (nim, tic-tac-toe), and — when a deploymentId is given —
 * what that deployed model would play at each position. Games without a
 * built-in engine still get the model comparison; their flags are just neutral.
 *
 * @param matchId - the match to analyze
 * @param deploymentId - optional loaded model to also ask for its move
 * @returns per-move results, or null if no match with this id exists
 */
export async function analyzeReplay(
  matchId: string,
  deploymentId?: string,
): Promise<AnalysisResult | null> {
  const record = await MatchRepo.find(matchId);
  if (!record) return null;

  const gameKey = record.gameKey;
  const engineSolvable = ENGINE_SOLVABLE_GAME_KEYS.includes(gameKey);
  // Reconstruction is only needed to feed the engine or the model; skip it for
  // games that get neither (e.g. an un-deployed guess match).
  const states = engineSolvable || deploymentId !== undefined ? reconstructStates(record) : [];

  await ensureLoaded(deploymentId);
  let modelMoves: unknown[] = [];
  let aiError: string | undefined;
  if (deploymentId) {
    ({ moves: modelMoves, error: aiError } = await collectModelMoves(
      deploymentId,
      gameKey,
      states,
    ));
  }

  const perMove: AnalysisMoveResult[] = record.moves.map((m, moveIndex) => {
    const verdict = engineSolvable
      ? analyzeClosedFormMove(gameKey, states[moveIndex], m.move)
      : null;
    const result: AnalysisMoveResult = verdict
      ? { moveIndex, ...verdict }
      : { moveIndex, flag: "neutral", confidence: 0 };
    if (modelMoves[moveIndex] !== undefined) result.engineMove = modelMoves[moveIndex];
    return result;
  });

  return {
    matchId,
    generatedAt: new Date().toISOString(),
    perMove,
    ...(aiError !== undefined ? { aiError } : {}),
  };
}
