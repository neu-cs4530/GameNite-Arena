/**
 * server/src/services/inferenceClient.ts
 * ======================================
 * Thin HTTP client the main backend uses to talk to the inference service
 * (now a self-hosted box reached over HTTPS). Base URL comes from env so local
 * dev and the deployed box differ only by config.
 *
 * Env:
 *   INFERENCE_SERVICE_URL   e.g. http://localhost:8001 (dev)
 *                                https://inference.your-box.example (prod box)
 *   INFERENCE_SHARED_TOKEN  shared secret; sent as `Authorization: Bearer ...`
 *                           on every request so only this backend can drive
 *                           load/move/unload. Never logged.
 *   INFERENCE_TLS_CA        the box's SELF-SIGNED CA, either inline PEM or a
 *                           path to a PEM file. When set, Node's fetch trusts
 *                           it via an undici dispatcher — verification stays ON
 *                           (we never disable TLS globally). Mirrors the
 *                           self-signed approach in redis.ts (redisTlsOptions).
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

import * as fs from "node:fs";
import { Agent } from "undici";
import { z } from "zod";

const BASE_URL = process.env["INFERENCE_SERVICE_URL"] ?? "http://localhost:8001";

/**
 * The shared secret for the box, or undefined when unset/empty. When present
 * it is attached as `Authorization: Bearer <token>`; when absent the header is
 * simply omitted (the box itself fails closed). Read at call time so tests and
 * deploys can set it via env without re-importing the module.
 */
function sharedToken(): string | undefined {
  const token = process.env["INFERENCE_SHARED_TOKEN"];
  return token === undefined || token === "" ? undefined : token;
}

/**
 * The PEM for the box's self-signed CA, or undefined to verify against the
 * system trust store. INFERENCE_TLS_CA is either inline PEM (begins with
 * `-----BEGIN`) or a path to a PEM file. Exported under a test name so the
 * resolution is unit-testable without spinning a TLS server.
 */
function resolveInferenceTlsCa(): string | undefined {
  const raw = process.env["INFERENCE_TLS_CA"];
  if (raw === undefined || raw === "") return undefined;
  if (raw.includes("-----BEGIN")) return raw;
  return fs.readFileSync(raw, "utf8");
}

/** Test hook: re-exported resolver for the self-signed CA (see spec). */
export function inferenceTlsCaForTests(): string | undefined {
  return resolveInferenceTlsCa();
}

/**
 * An undici dispatcher that trusts the box's self-signed CA, built once on
 * first use. Returns undefined when no CA is configured so fetch keeps its
 * default (system-CA) dispatcher. We pin the CA rather than disabling
 * verification — NODE_TLS_REJECT_UNAUTHORIZED is never touched.
 */
let tlsDispatcher: Agent | undefined;
let tlsDispatcherResolved = false;
function inferenceDispatcher(): Agent | undefined {
  if (!tlsDispatcherResolved) {
    const ca = resolveInferenceTlsCa();
    tlsDispatcher = ca === undefined ? undefined : new Agent({ connect: { ca } });
    tlsDispatcherResolved = true;
  }
  return tlsDispatcher;
}

/** Common request init: JSON, the shared-token header, and the TLS dispatcher. */
function authedInit(extra: RequestInit): RequestInit {
  const headers = new Headers(extra.headers);
  headers.set("Content-Type", "application/json");
  const token = sharedToken();
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  // `dispatcher` is an undici extension to RequestInit that Node's fetch honors
  // (declared by undici-types); an Agent is a Dispatcher, so this type-checks.
  const init: RequestInit = { ...extra, headers };
  const dispatcher = inferenceDispatcher();
  if (dispatcher !== undefined) init.dispatcher = dispatcher;
  return init;
}

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
    res = await fetch(
      `${BASE_URL}${path}`,
      authedInit({ method: "POST", body: JSON.stringify(body) }),
    );
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
  health(): Promise<{ status: string; loaded: number }>;
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
    const res = await fetch(`${BASE_URL}/inference/health`, authedInit({ method: "GET" }));
    if (!res.ok) throw new InferenceError("Inference health failed", res.status);
    // The box's open /health returns minimal info: a status and an occupancy
    // COUNT (never the deployment-id list — that requires the token).
    return (await res.json()) as { status: string; loaded: number };
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
export function health(): Promise<{ status: string; loaded: number }> {
  return activeClient.health();
}
