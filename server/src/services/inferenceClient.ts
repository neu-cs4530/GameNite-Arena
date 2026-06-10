/**
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

/** Load a model into a runtime slot. (storage->inference handoff, #27) */
export function loadModel(input: {
  deploymentId: string;
  game: string;
  storageKey: string;
}): Promise<unknown> {
  /* eslint-disable @typescript-eslint/naming-convention */
  return post("/inference/load", {
    deployment_id: input.deploymentId,
    game: input.game,
    storage_key: input.storageKey,
  });
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Free a runtime slot (pause/retire). */
export function unloadModel(deploymentId: string): Promise<unknown> {
  /* eslint-disable @typescript-eslint/naming-convention */
  return post("/inference/unload", { deployment_id: deploymentId });
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Ask a deployed model for its move. */
export function requestMove(input: {
  deploymentId: string;
  state: unknown;
  legalMoves?: unknown[];
}): Promise<unknown> {
  /* eslint-disable @typescript-eslint/naming-convention */
  return post("/inference/move", {
    deployment_id: input.deploymentId,
    state: input.state,
    legal_moves: input.legalMoves ?? null,
  });
  /* eslint-enable @typescript-eslint/naming-convention */
}

/** Liveness check. */
export async function health(): Promise<{ status: string; loaded: string[] }> {
  const res = await fetch(`${BASE_URL}/inference/health`);
  if (!res.ok) throw new InferenceError("Inference health failed", res.status);
  return (await res.json()) as { status: string; loaded: string[] };
}
