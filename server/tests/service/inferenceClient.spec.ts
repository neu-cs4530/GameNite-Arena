import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InferenceError,
  health,
  loadModel,
  requestMove,
  resetInferenceClientForTests,
  setInferenceClientForTests,
  unloadModel,
} from "../../src/services/inferenceClient.ts";

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

afterEach(() => {
  vi.unstubAllGlobals();
  resetInferenceClientForTests();
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
  it("returns the parsed health payload", async () => {
    stubFetch(jsonResponse({ status: "ok", loaded: ["dep-1"] }));

    await expect(health()).resolves.toEqual({ status: "ok", loaded: ["dep-1"] });
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
