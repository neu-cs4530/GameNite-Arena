/**
 * server/src/services/inferenceClient.ts
 * ======================================
 * Thin HTTP client the main backend uses to talk to the inference service
 * (a separate Render Web Service). Base URL comes from env so local dev and
 * Render deploys differ only by config.
 *
 * Env:
 *   INFERENCE_SERVICE_URL   e.g. http://localhost:8001 (dev)
 *                                https://gamenite-inference.onrender.com (prod)
 *
 * Note: the inference service API uses snake_case field names (Python/FastAPI
 * convention). We suppress the naming-convention lint rule on those objects only.
 *
 * Testing: unit tests must not require the python service, so the exported
 * functions delegate through a swappable client object. Specs inject scripted
 * responses with setInferenceClientForTests() (same pattern as
 * matchRecorder.resetForTests); production behavior is identical while the
 * seam is unused because the active client IS the HTTP client.
 */

import { z } from "zod";

const BASE_URL = process.env["INFERENCE_SERVICE_URL"] ?? "http://localhost:8001";

export class InferenceError extends Error {
  status: number;
  /**
   * The model's consecutive invalid-move count, parsed from the service's
   * structured 422 body (CoS 2.8). Absent for other failures.
   */
  consecutiveInvalid?: number;
  /** True when the model has struck out and must forfeit (CoS 2.8). */
  forfeit?: boolean;

  constructor(
    message: string,
    status: number,
    details?: { consecutiveInvalid?: number; forfeit?: boolean },
  ) {
    super(message);
    this.status = status;
    this.consecutiveInvalid = details?.consecutiveInvalid;
    this.forfeit = details?.forfeit;
  }
}

/**
 * The FastAPI error body for an invalid-move rejection:
 *   { "detail": { "error": "...", "consecutive_invalid": 2, "forfeit": false } }
 * Other errors (plain-string detail, proxy HTML, etc.) won't match and fall
 * back to the flattened-text message.
 */
/* eslint-disable @typescript-eslint/naming-convention */
const zInferenceErrorBody = z.object({
  detail: z.object({
    error: z.string(),
    consecutive_invalid: z.number().optional(),
    forfeit: z.boolean().optional(),
  }),
});
/* eslint-enable @typescript-eslint/naming-convention */

/** Builds the InferenceError for a non-OK response, keeping any 422 detail. */
function toInferenceError(path: string, raw: string, status: number): InferenceError {
  let structured: z.infer<typeof zInferenceErrorBody> | null = null;
  try {
    structured = zInferenceErrorBody.parse(JSON.parse(raw));
  } catch {
    structured = null;
  }
  if (structured) {
    return new InferenceError(`Inference ${path} failed: ${structured.detail.error}`, status, {
      consecutiveInvalid: structured.detail.consecutive_invalid,
      forfeit: structured.detail.forfeit,
    });
  }
  return new InferenceError(`Inference ${path} failed: ${raw}`, status);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new InferenceError(`Inference service unreachable: ${(err as Error).message}`, 503);
  }
  if (!res.ok) {
    throw toInferenceError(path, await res.text(), res.status);
  }
  return (await res.json()) as T;
}

/** The callable surface of this module, swappable for tests. */
interface InferenceClient {
  loadModel(input: { deploymentId: string; game: string; modelId: string }): Promise<unknown>;
  unloadModel(deploymentId: string): Promise<unknown>;
  requestMove(input: {
    deploymentId: string;
    state: unknown;
    legalMoves?: unknown[];
  }): Promise<unknown>;
  health(): Promise<{ status: string; loaded: string[] }>;
}

const httpClient: InferenceClient = {
  loadModel(input) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return post("/inference/load", {
      deployment_id: input.deploymentId,
      game: input.game,
      model_id: input.modelId,
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  },

  unloadModel(deploymentId) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return post("/inference/unload", { deployment_id: deploymentId });
    /* eslint-enable @typescript-eslint/naming-convention */
  },

  requestMove(input) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return post("/inference/move", {
      deployment_id: input.deploymentId,
      state: input.state,
      legal_moves: input.legalMoves ?? null,
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  },

  async health() {
    const res = await fetch(`${BASE_URL}/inference/health`);
    if (!res.ok) throw new InferenceError("Inference health failed", res.status);
    return (await res.json()) as { status: string; loaded: string[] };
  },
};

let activeClient: InferenceClient = httpClient;

/**
 * Replaces some or all inference calls with scripted implementations.
 * Test hook — never call in production code.
 */
export function setInferenceClientForTests(overrides: Partial<InferenceClient>): void {
  activeClient = { ...httpClient, ...overrides };
}

/** Restores the real HTTP client. Test hook — never call in production code. */
export function resetInferenceClientForTests(): void {
  activeClient = httpClient;
}

/** Load a model into a runtime slot. (storage->inference handoff, #27) */
export function loadModel(input: {
  deploymentId: string;
  game: string;
  modelId: string;
}): Promise<unknown> {
  return activeClient.loadModel(input);
}

/** Free a runtime slot (pause/retire). */
export function unloadModel(deploymentId: string): Promise<unknown> {
  return activeClient.unloadModel(deploymentId);
}

/** Ask a deployed model for its move. */
export function requestMove(input: {
  deploymentId: string;
  state: unknown;
  legalMoves?: unknown[];
}): Promise<unknown> {
  return activeClient.requestMove(input);
}

/** Liveness check. */
export function health(): Promise<{ status: string; loaded: string[] }> {
  return activeClient.health();
}
