/**
 * Real-API helpers for the trainer e2e suites.
 *
 * These suites are the proof that the trainer UI shows what a REAL run
 * produced: every fixture is created through the live REST API (exactly the
 * calls ai/session_reporter.py makes), never through client mocks.
 *
 * Isolation: each suite registers its own throwaway user, so counts start
 * from zero, the per-game deployment cap can't be polluted across suites,
 * and the seeded user0 fixtures stay pristine for the mock-backed model
 * pages. The server keeps state for its lifetime — suites always navigate
 * by ids returned from these helpers, never by absolute counts of someone
 * else's data.
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";

// The client tsconfig deliberately omits Node types; at runtime these
// helpers execute under Node where a real Buffer exists.
declare const Buffer: { from(input: string, encoding?: string): Uint8Array };

export const API_BASE = "http://localhost:8000";

export interface TrainerUser {
  username: string;
  password: string;
}

/** Register a unique user for one suite and return its credentials. */
export async function signupTrainerUser(
  request: APIRequestContext,
  prefix: string,
): Promise<TrainerUser> {
  const username = `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  const password = "e2e-password";
  const res = await request.post(`${API_BASE}/api/user/signup`, {
    data: { username, password },
  });
  expect(res.ok()).toBeTruthy();
  return { username, password };
}

/** UI login with the suite's user. */
export async function logInTrainer(page: Page, user: TrainerUser): Promise<void> {
  await logIn(page, user.username, user.password);
}

interface RegisterOptions {
  gameKey?: string;
  name?: string;
  episodes?: number;
  learningRate?: number;
}

/** POST /api/training/submit — same call the web form and the CLI make. */
export async function registerSession(
  request: APIRequestContext,
  user: TrainerUser,
  opts: RegisterOptions = {},
): Promise<{ jobId: string; modelId: string }> {
  const res = await request.post(`${API_BASE}/api/training/submit`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: {
        gameKey: opts.gameKey ?? "nim",
        modelDisplayName: opts.name ?? `e2e-bot-${Date.now().toString(36)}`,
        config: {
          episodes: opts.episodes ?? 1000,
          learningRate: opts.learningRate ?? 0.0003,
        },
      },
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { jobId: string; modelId: string };
  return { jobId: body.jobId, modelId: body.modelId };
}

/** POST progress — what session_reporter.report() sends. Returns the status. */
export async function reportProgress(
  request: APIRequestContext,
  user: TrainerUser,
  jobId: string,
  episodes: number,
  metrics: Record<string, number> = {},
): Promise<string> {
  const res = await request.post(`${API_BASE}/api/training/${jobId}/progress`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: { episodes, metrics, message: `episode ${episodes}` },
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { status: string };
  return body.status;
}

export async function cancelSession(
  request: APIRequestContext,
  user: TrainerUser,
  jobId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/api/training/${jobId}/cancel`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: {},
    },
  });
  expect(res.ok()).toBeTruthy();
}

export async function completeSession(
  request: APIRequestContext,
  user: TrainerUser,
  jobId: string,
  finalMetrics: Record<string, number> = { winRate: 0.9, meanReward: 0.7 },
): Promise<void> {
  const res = await request.post(`${API_BASE}/api/training/${jobId}/complete`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: { finalMetrics },
    },
  });
  expect(res.ok()).toBeTruthy();
}

export async function failSession(
  request: APIRequestContext,
  user: TrainerUser,
  jobId: string,
  error: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/api/training/${jobId}/fail`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: { error },
    },
  });
  expect(res.ok()).toBeTruthy();
}

/** Multipart .pth upload — the exact contract of the artifact route. */
export async function uploadArtifact(
  request: APIRequestContext,
  user: TrainerUser,
  jobId: string,
  contents = "e2e fake torch weights",
): Promise<void> {
  const res = await request.post(`${API_BASE}/api/training/${jobId}/artifact`, {
    multipart: {
      auth: JSON.stringify({ username: user.username, password: user.password }),
      file: {
        name: "trained.pth",
        mimeType: "application/octet-stream",
        // Cast: jsdom's type chain (unit-test harness) surfaces a second
        // Uint8Array generic instantiation that makes tsc see this Buffer
        // as a plain Uint8Array. The runtime value is a Node Buffer.
        buffer: Buffer.from(contents) as Buffer,
      },
    },
  });
  expect(res.ok()).toBeTruthy();
}

/** Deploy a model (POST /api/model/:id/deploy) — needs an uploaded artifact. */
export async function deployModel(
  request: APIRequestContext,
  user: TrainerUser,
  modelId: string,
  displayName = "e2e deployment",
): Promise<string> {
  const res = await request.post(`${API_BASE}/api/model/${modelId}/deploy`, {
    data: {
      auth: { username: user.username, password: user.password },
      payload: { displayName },
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { deploymentId: string };
  return body.deploymentId;
}
