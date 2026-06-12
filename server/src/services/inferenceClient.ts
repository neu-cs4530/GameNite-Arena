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
 */

const BASE_URL = process.env["INFERENCE_SERVICE_URL"] ?? "http://localhost:8001";

export class InferenceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    const detail = await res.text();
    throw new InferenceError(`Inference ${path} failed: ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

export interface InferenceClient {
  loadModel(input: { deploymentId: string; game: string; modelId: string }): Promise<unknown>;
  unloadModel(deploymentId: string): Promise<unknown>;
  requestMove(input: {
    deploymentId: string;
    state: unknown;
    legalMoves?: unknown[];
  }): Promise<unknown>;
  health(): Promise<{ status: string; loaded: string[] }>;
}

/* eslint-disable @typescript-eslint/naming-convention */
const httpClient: InferenceClient = {
  // Load a model into a runtime slot. (storage->inference handoff, #27)
  loadModel: (input) =>
    post("/inference/load", {
      deployment_id: input.deploymentId,
      game: input.game,
      model_id: input.modelId,
    }),

  // Free a runtime slot (pause/retire).
  unloadModel: (deploymentId) => post("/inference/unload", { deployment_id: deploymentId }),

  // Ask a deployed model for its move.
  requestMove: (input) =>
    post("/inference/move", {
      deployment_id: input.deploymentId,
      state: input.state,
      legal_moves: input.legalMoves ?? null,
    }),

  // Liveness check.
  async health() {
    const res = await fetch(`${BASE_URL}/inference/health`);
    if (!res.ok) throw new InferenceError("Inference health failed", res.status);
    return (await res.json()) as { status: string; loaded: string[] };
  },
};

// stand-in for the real service, so the analysis "engine move" flow can be
// built/tested before a model is actually loaded into inference.
export const mockInferenceClient: InferenceClient = {
  loadModel: () => Promise.resolve({ status: "loaded" }),
  unloadModel: () => Promise.resolve({ status: "unloaded" }),
  requestMove: () => Promise.resolve({ move: 1 }),
  health: () => Promise.resolve({ status: "ok", loaded: [] }),
};

let activeClient: InferenceClient = httpClient;

/** Swap the client every export below delegates to (e.g. mockInferenceClient). */
export function setInferenceClient(client: InferenceClient): void {
  activeClient = client;
}

export function resetInferenceClient(): void {
  activeClient = httpClient;
}

export function loadModel(input: {
  deploymentId: string;
  game: string;
  modelId: string;
}): Promise<unknown> {
  return activeClient.loadModel(input);
}

export function unloadModel(deploymentId: string): Promise<unknown> {
  return activeClient.unloadModel(deploymentId);
}

export function requestMove(input: {
  deploymentId: string;
  state: unknown;
  legalMoves?: unknown[];
}): Promise<unknown> {
  return activeClient.requestMove(input);
}

export function health(): Promise<{ status: string; loaded: string[] }> {
  return activeClient.health();
}
