import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InferenceError,
  health,
  inferenceTlsCaForTests,
  loadModel,
  requestMove,
  resetInferenceClientForTests,
  resetInferenceRetryConfigForTests,
  setInferenceClientForTests,
  setInferenceRetryConfigForTests,
  unloadModel,
} from "../../src/services/inferenceClient.ts";

const SHARED_TOKEN = "box-shared-token-xyz";

function authHeaderOf(init: RequestInit | undefined): string | undefined {
  const headers = new Headers(init?.headers);
  return headers.get("Authorization") ?? undefined;
}

beforeEach(() => {
  process.env["INFERENCE_SHARED_TOKEN"] = SHARED_TOKEN;
});

/* ---------------------------------------------------------------------------
 * Unit tests for the inference HTTP client. The python service never runs in
 * unit tests: the production code paths are exercised against a stubbed
 * global fetch (the HTTP boundary), and the injection seam is verified to
 * reroute calls without touching fetch at all.
 *
 * The wire format is snake_case by FastAPI convention, so the naming rule is
 * relaxed for this spec only (mirrors the disables in inferenceClient.ts).
 * ------------------------------------------------------------------------- */
/* eslint-disable @typescript-eslint/naming-convention */

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const mock = vi.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// The existing cases below assert the single-request contract (one fetch per
// call, the error surfaced verbatim), so retries are disabled for them. The
// "retry / timeout" block opts back in to exercise the backoff path.
beforeEach(() => {
  setInferenceRetryConfigForTests({ maxAttempts: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetInferenceClientForTests();
  delete process.env["INFERENCE_SHARED_TOKEN"];
  delete process.env["INFERENCE_TLS_CA"];
});

describe("requestMove", () => {
  it("POSTs the snake_case body and returns the parsed response", async () => {
    const fetchMock = stubFetch(jsonResponse({ deployment_id: "dep-1", move: 2 }));

    const result = await requestMove({ deploymentId: "dep-1", state: { remaining: 7 } });

    expect(result).toEqual({ deployment_id: "dep-1", move: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/inference\/move$/);
    expect(JSON.parse(init.body as string)).toEqual({
      deployment_id: "dep-1",
      state: { remaining: 7 },
      legal_moves: null,
    });
  });

  it("forwards legal moves when provided", async () => {
    const fetchMock = stubFetch(jsonResponse({ move: 1 }));

    await requestMove({ deploymentId: "dep-1", state: {}, legalMoves: [1, 2, 3] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      deployment_id: "dep-1",
      state: {},
      legal_moves: [1, 2, 3],
    });
  });

  it("surfaces the structured 422 payload on an invalid-move rejection", async () => {
    stubFetch(
      jsonResponse(
        { detail: { error: "no legal action", consecutive_invalid: 2, forfeit: false } },
        422,
      ),
    );

    const err = await requestMove({ deploymentId: "dep-1", state: {} }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InferenceError);
    const inferenceError = err as InferenceError;
    expect(inferenceError.status).toBe(422);
    expect(inferenceError.message).toContain("no legal action");
    expect(inferenceError.consecutiveInvalid).toBe(2);
    expect(inferenceError.forfeit).toBe(false);
  });

  it("surfaces forfeit=true on the third consecutive invalid move (CoS 2.8)", async () => {
    stubFetch(
      jsonResponse(
        { detail: { error: "no legal action", consecutive_invalid: 3, forfeit: true } },
        422,
      ),
    );

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err.consecutiveInvalid).toBe(3);
    expect(err.forfeit).toBe(true);
  });

  it("parses a structured detail that omits the counters", async () => {
    stubFetch(jsonResponse({ detail: { error: "bad state" } }, 422));

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err.message).toContain("bad state");
    expect(err.consecutiveInvalid).toBeUndefined();
    expect(err.forfeit).toBeUndefined();
  });

  it("falls back to the raw body for a non-JSON error response", async () => {
    stubFetch(new Response("Bad Gateway", { status: 502 }));

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err).toBeInstanceOf(InferenceError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("Bad Gateway");
    expect(err.consecutiveInvalid).toBeUndefined();
    expect(err.forfeit).toBeUndefined();
  });

  it("falls back to the raw body for a JSON error without the 422 shape", async () => {
    stubFetch(jsonResponse({ detail: "No such deployment: dep-1" }, 404));

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err.status).toBe(404);
    expect(err.message).toContain("No such deployment");
    expect(err.forfeit).toBeUndefined();
  });

  it("falls back to the raw body when the detail fields have the wrong types", async () => {
    stubFetch(jsonResponse({ detail: { error: 42, consecutive_invalid: "x" } }, 422));

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err.status).toBe(422);
    expect(err.consecutiveInvalid).toBeUndefined();
    expect(err.forfeit).toBeUndefined();
  });

  it("wraps network failures as a 503 InferenceError", async () => {
    const mock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mock);

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err).toBeInstanceOf(InferenceError);
    expect(err.status).toBe(503);
    expect(err.message).toContain("ECONNREFUSED");
  });
});

describe("retry / timeout", () => {
  it("retries a network failure and succeeds on a later attempt", async () => {
    setInferenceRetryConfigForTests({ maxAttempts: 3, baseDelayMs: 0 });
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ move: 4 }));
    vi.stubGlobal("fetch", mock);

    const result = await requestMove({ deploymentId: "dep-1", state: {} });

    expect(result).toEqual({ move: 4 });
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("retries a 503 from a cold-starting service and succeeds", async () => {
    setInferenceRetryConfigForTests({ maxAttempts: 3, baseDelayMs: 0 });
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ move: 1 }));
    vi.stubGlobal("fetch", mock);

    const result = await requestMove({ deploymentId: "dep-1", state: {} });

    expect(result).toEqual({ move: 1 });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("gives up with a 503 InferenceError after exhausting retries on a network failure", async () => {
    setInferenceRetryConfigForTests({ maxAttempts: 3, baseDelayMs: 0 });
    const mock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", mock);

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err).toBeInstanceOf(InferenceError);
    expect(err.status).toBe(503);
    expect(err.message).toContain("fetch failed");
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a 4xx (deterministic) rejection", async () => {
    setInferenceRetryConfigForTests({ maxAttempts: 3, baseDelayMs: 0 });
    const mock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { detail: { error: "no legal action", consecutive_invalid: 3, forfeit: true } },
          422,
        ),
      );
    vi.stubGlobal("fetch", mock);

    const err = (await requestMove({ deploymentId: "dep-1", state: {} }).catch(
      (e: unknown) => e,
    )) as InferenceError;

    expect(err.status).toBe(422);
    expect(err.forfeit).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung request after the per-attempt timeout and retries", async () => {
    setInferenceRetryConfigForTests({ maxAttempts: 2, baseDelayMs: 0, timeoutMs: 20 });
    const mock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      // First attempt: hang until the injected AbortSignal fires, then reject
      // like fetch does on abort. Second attempt: resolve immediately.
      if (mock.mock.calls.length === 1) {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })),
          );
        });
      }
      return Promise.resolve(jsonResponse({ move: 9 }));
    });
    vi.stubGlobal("fetch", mock);

    const result = await requestMove({ deploymentId: "dep-1", state: {} });

    expect(result).toEqual({ move: 9 });
    expect(mock).toHaveBeenCalledTimes(2);
    // The per-attempt timeout must have been wired through as an AbortSignal.
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("loadModel / unloadModel", () => {
  it("loadModel POSTs the slot assignment", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "loaded" }));

    const result = await loadModel({ deploymentId: "dep-1", game: "nim", modelId: "model-1" });

    expect(result).toEqual({ status: "loaded" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/inference\/load$/);
    expect(JSON.parse(init.body as string)).toEqual({
      deployment_id: "dep-1",
      game: "nim",
      model_id: "model-1",
    });
  });

  it("unloadModel POSTs the deployment id", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "unloaded" }));

    await unloadModel("dep-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/inference\/unload$/);
    expect(JSON.parse(init.body as string)).toEqual({ deployment_id: "dep-1" });
  });
});

describe("health", () => {
  it("returns the parsed minimal health payload (occupancy count, not the list)", async () => {
    stubFetch(jsonResponse({ status: "ok", loaded: 1 }));

    await expect(health()).resolves.toEqual({ status: "ok", loaded: 1 });
  });

  it("throws an InferenceError when the health check fails", async () => {
    stubFetch(new Response("down", { status: 500 }));

    const err = (await health().catch((e: unknown) => e)) as InferenceError;
    expect(err).toBeInstanceOf(InferenceError);
    expect(err.status).toBe(500);
  });
});

describe("test seam", () => {
  it("routes overridden calls through the injected client without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const scripted = vi.fn().mockResolvedValue({ move: 3 });

    setInferenceClientForTests({ requestMove: scripted });

    await expect(requestMove({ deploymentId: "dep-1", state: {} })).resolves.toEqual({ move: 3 });
    expect(scripted).toHaveBeenCalledWith({ deploymentId: "dep-1", state: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps non-overridden calls on the real HTTP path", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "unloaded" }));
    setInferenceClientForTests({ requestMove: vi.fn() });

    await unloadModel("dep-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resetInferenceClientForTests restores the HTTP client", async () => {
    const scripted = vi.fn().mockResolvedValue({ move: 3 });
    setInferenceClientForTests({ requestMove: scripted });
    resetInferenceClientForTests();

    const fetchMock = stubFetch(jsonResponse({ move: 1 }));
    await requestMove({ deploymentId: "dep-1", state: {} });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scripted).not.toHaveBeenCalled();
  });
});

describe("shared-token auth header", () => {
  it("attaches the bearer token to loadModel POSTs", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "loaded" }));

    await loadModel({ deploymentId: "dep-1", game: "nim", modelId: "model-1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBe(`Bearer ${SHARED_TOKEN}`);
  });

  it("attaches the bearer token to unloadModel POSTs", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "unloaded" }));

    await unloadModel("dep-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBe(`Bearer ${SHARED_TOKEN}`);
  });

  it("attaches the bearer token to requestMove POSTs", async () => {
    const fetchMock = stubFetch(jsonResponse({ move: 1 }));

    await requestMove({ deploymentId: "dep-1", state: {} });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBe(`Bearer ${SHARED_TOKEN}`);
  });

  it("keeps the Content-Type header alongside the token", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "loaded" }));

    await loadModel({ deploymentId: "dep-1", game: "nim", modelId: "model-1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe(`Bearer ${SHARED_TOKEN}`);
  });

  it("omits the Authorization header when no token is configured", async () => {
    delete process.env["INFERENCE_SHARED_TOKEN"];
    const fetchMock = stubFetch(jsonResponse({ status: "loaded" }));

    await loadModel({ deploymentId: "dep-1", game: "nim", modelId: "model-1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBeUndefined();
  });
});

describe("inferenceTlsCaForTests (self-signed box cert trust)", () => {
  it("returns the PEM contents verbatim when INFERENCE_TLS_CA is inline PEM", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIIBy}fake\n-----END CERTIFICATE-----\n";
    process.env["INFERENCE_TLS_CA"] = pem;
    expect(inferenceTlsCaForTests()).toBe(pem);
  });

  it("reads the PEM from disk when INFERENCE_TLS_CA is a file path", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const pem = "-----BEGIN CERTIFICATE-----\nONDISK\n-----END CERTIFICATE-----\n";
    const file = path.join(os.tmpdir(), `inference-ca-${Date.now()}.pem`);
    fs.writeFileSync(file, pem);
    try {
      process.env["INFERENCE_TLS_CA"] = file;
      expect(inferenceTlsCaForTests()).toBe(pem);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("returns undefined (verify with system CAs) when INFERENCE_TLS_CA is unset", () => {
    delete process.env["INFERENCE_TLS_CA"];
    expect(inferenceTlsCaForTests()).toBeUndefined();
  });
});
