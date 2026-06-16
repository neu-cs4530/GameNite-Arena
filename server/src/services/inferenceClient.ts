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

/**
 * Retry/timeout policy for outbound inference calls.
 *
 * The inference service is a separate Render Web Service. On the free tier it
 * spins down after ~15 min idle, so the first request after an idle period
 * fails with `fetch failed` until it cold-starts (~50s); a brief redeploy or
 * network blip looks the same. A single hard failure there used to stall a
 * live match forever (the AI's turn never completes — see game.service
 * maybeFireAiMove), so transient unreachability is retried with exponential
 * backoff before giving up. Every knob is env-tunable with conservative
 * defaults; total time is bounded (attempts * timeout + backoff), never
 * infinite.
 */
interface RetryConfig {
  /** Total attempts including the first try (1 disables retries). */
  maxAttempts: number;
  /** Base backoff before attempt N+1; grows ~2^n with light jitter. */
  baseDelayMs: number;
  /** Per-attempt deadline; the request is aborted past this. */
  timeoutMs: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: Math.max(1, intFromEnv("INFERENCE_MAX_ATTEMPTS", 3)),
    baseDelayMs: intFromEnv("INFERENCE_RETRY_BASE_MS", 300),
    timeoutMs: Math.max(1, intFromEnv("INFERENCE_TIMEOUT_MS", 10000)),
  };
}

let retryConfig: RetryConfig = defaultRetryConfig();

/**
 * Overrides the retry/timeout policy. Test hook — specs use this to make the
 * backoff instant and deterministic. Never call in production code.
 */
export function setInferenceRetryConfigForTests(overrides: Partial<RetryConfig>): void {
  retryConfig = { ...retryConfig, ...overrides };
}

/** Restores the env-derived retry policy. Test hook — never call in prod. */
export function resetInferenceRetryConfigForTests(): void {
  retryConfig = defaultRetryConfig();
}

/** HTTP statuses that mean "try again": gateway/unavailable/timeout. A 4xx is
 * deterministic (bad request, invalid move) and is never retried. */
const retryableStatuses = new Set([502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Decides whether `err` from {@link postOnce} is worth another attempt. A 503
 * from an unreachable service (network failure) and the gateway/timeout 5xx
 * family are transient; a 4xx invalid-move/bad-request is not.
 */
function isRetryable(err: InferenceError): boolean {
  return err.status === 503 || retryableStatuses.has(err.status);
}

/** One POST attempt with a hard per-attempt deadline. Network failures and
 * the abort timeout surface as a 503 (service unreachable); a non-OK response
 * surfaces with its real status so 422 forfeit detail survives. */
async function postOnce<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = err as Error;
    const reason = e.name === "TimeoutError" || e.name === "AbortError" ? "timed out" : e.message;
    throw new InferenceError(`Inference service unreachable: ${reason}`, 503);
  }
  if (!res.ok) {
    throw toInferenceError(path, await res.text(), res.status);
  }
  return (await res.json()) as T;
}

/**
 * POSTs to the inference service, retrying transient unreachability (network
 * failure, cold-start 503, gateway 5xx) with exponential backoff up to the
 * configured attempt budget. Deterministic failures (4xx, including the 422
 * invalid-move/forfeit signal) throw immediately so callers see them on the
 * first try.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const { maxAttempts, baseDelayMs, timeoutMs } = retryConfig;
  let lastError: InferenceError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await postOnce<T>(path, body, timeoutMs);
    } catch (err) {
      if (!(err instanceof InferenceError) || !isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }
      lastError = err;
      // Exponential backoff with jitter so a fleet of stalled matches doesn't
      // thundering-herd the service the instant it comes back.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = backoff > 0 ? Math.random() * baseDelayMs : 0;
      // eslint-disable-next-line no-console
      console.warn(
        `Inference ${path} attempt ${attempt}/${maxAttempts} failed (${err.message}); retrying in ~${Math.round(backoff + jitter)}ms`,
      );
      await sleep(backoff + jitter);
    }
  }
  // Unreachable: the loop either returns or throws, but TS needs a terminus.
  throw lastError ?? new InferenceError("Inference service unreachable", 503);
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
