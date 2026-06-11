/**
 * Trainer model-related service functions.
 *
 * Real-first pattern (mirrors `replayService.ts`): each call hits the live
 * REST endpoint and falls back to the deterministic client fixture only on
 * network failure / 5xx (and per-id 404 — ids like `mock-model-1` exist
 * only in the fixture).
 *
 * What the server actually serves today (server/src/controllers/model.controller.ts):
 *   POST  /api/model/upload          — multipart .pth artifact upload
 *   GET   /api/model/user/:username  — all models owned by one user
 *   GET   /api/model/:id             — one model
 *   POST  /api/model/:id/deploy      — create deployment (see deploymentService)
 *   PATCH /api/model/deployment/:id  — update deployment status (see deploymentService)
 *
 * LIST DECISION RULE: when the server responds successfully, server data
 * wins UNLESS the list is empty and the mock has entries — then we fall
 * back to the mock. // TODO(real-data): remove the empty-list fallback once
 * the server seeds/serves real model data; today a fresh server has no
 * models, and the e2e suite asserts on the fixture.
 *
 * PER-ID DECISION RULE: 404 → try the mock before erroring, so fixture ids
 * keep resolving while the server's repo is sparse.
 *
 * Endpoints that DO NOT exist yet stay mock-only and are marked
 * `TODO(@team)` with the proposed route, so consumers need zero changes
 * when they land.
 */

import type { UserAuth } from "@gamenite/shared";
import type {
  ModelCardStats,
  ModelDetail,
  ModelFilters,
  ModelListPage,
  ModelSummary,
  ForkModelPayload,
  TrainerGameKey,
  UploadHeuristicPayload,
} from "../util/types.ts";
import { api } from "./api.ts";
import { mapModelInfoToDetail, mapModelInfoToSummary, type ModelInfoWire } from "./modelMapper.ts";
import { delay, isFallbackEligible } from "./serviceFallback.ts";
import {
  filterMockModels,
  findMockModel,
  mockHelloWorld,
  MOCK_MODELS,
  recentlyForkedModels,
  starterTemplateModels,
  topModelPerGame,
  trainerDaysAgo,
} from "../__mocks__/training.ts";

const MOCK_LATENCY_MS = 80;

/** Matches the server's `CURRENT_ADAPTER_VERSION` (model.service.ts). */
const ADAPTER_VERSION = "1.0.0";

/**
 * Returns a paginated, filtered model list.
 *
 * Real source: `GET /api/model/user/:username` — the only model list the
 * server exposes today, so it is queried for `filters.viewerUsername` and
 * the filter set is applied client-side (games + visibility + pagination;
 * the richer fixture-side filters are a non-goal until a real
 * `GET /api/model/list` exists — see TODO below).
 *
 * TODO(@team): a global `GET /api/model/list` (all public models + the
 * viewer's private ones, server-side filtering) is needed for the browse
 * page to show other users' models from real data. Until then, ownership
 * filters other than "yours" can only be satisfied by the fixture.
 */
export async function listModels(filters: ModelFilters): Promise<ModelListPage> {
  // The per-user endpoint can only answer "models owned by the viewer";
  // ownership filters that need OTHER users' models go straight to the
  // fixture until the global list endpoint exists.
  const realCanAnswer = filters.ownership === "all" || filters.ownership === "yours";
  if (filters.viewerUsername && realCanAnswer) {
    try {
      const res = await api.get<ModelInfoWire[]>(`/api/model/user/${filters.viewerUsername}`);
      let models: ModelSummary[] = res.data.map(mapModelInfoToSummary);
      if (models.length > 0) {
        if (filters.games.length > 0) {
          models = models.filter((m) => filters.games.includes(m.gameKey));
        }
        if (filters.visibility !== "all") {
          models = models.filter((m) => m.visibility === filters.visibility);
        }
        const start = (filters.page - 1) * filters.pageSize;
        return {
          models: models.slice(start, start + filters.pageSize),
          total: models.length,
          page: filters.page,
          pageSize: filters.pageSize,
        };
      }
      // Server reachable but has no models for this user → empty-list
      // fallback to the fixture (see LIST DECISION RULE in the header).
      // TODO(real-data): delete this branch once the server has real data.
    } catch (err) {
      // 404 = unknown username server-side; fixture users still resolve.
      if (!isFallbackEligible(err)) throw err;
    }
  }
  const { models, total } = filterMockModels(filters);
  return delay({ models, total, page: filters.page, pageSize: filters.pageSize }, MOCK_LATENCY_MS);
}

/** Fetches full detail for a single model id via `GET /api/model/:id`. */
export async function getModel(modelId: string): Promise<ModelDetail> {
  try {
    const res = await api.get<ModelInfoWire>(`/api/model/${modelId}`);
    return mapModelInfoToDetail(res.data);
  } catch (err) {
    if (isFallbackEligible(err)) {
      const m = findMockModel(modelId);
      if (m) {
        return delay(
          { ...m, jobIds: m.jobIds.slice(), deploymentIds: m.deploymentIds.slice() },
          MOCK_LATENCY_MS,
        );
      }
    }
    throw err instanceof Error ? err : new Error(`Model not found: ${modelId}`);
  }
}

/**
 * Returns computed stats for the public model card (Story 2.11).
 *
 * There is no dedicated card endpoint yet, so the card is DERIVED from
 * `getModel` (which is itself real-first) — one code path serves both real
 * and fixture models identically.
 *
 * TODO(@team): once the server aggregates match stats per model, replace
 * the derivation with `GET /api/model/:modelId/card`.
 */
export async function getModelCard(modelId: string): Promise<ModelCardStats> {
  const m = await getModel(modelId);
  return {
    modelId,
    winRate: m.winRate,
    averageMoveLatencyMs: 40 + Math.round((m.elo - 1000) / 20),
    perGameElo: [{ gameKey: m.gameKey, elo: m.elo }],
    totalMatchesPlayed: m.matchesPlayed,
    daysSinceLastTraining: Math.max(
      0,
      Math.round((Date.now() - Date.parse(m.lastTrainedAt)) / (24 * 60 * 60 * 1000)),
    ),
  };
}

/**
 * Uploads a heuristic file and registers a model for it.
 *
 * Real endpoint: `POST /api/model/upload` (multipart). It is attempted
 * first whenever `auth` is supplied, with the flat-field convention from
 * `POST /api/training/:jobId/artifact` (`auth` as one JSON-string field,
 * `metadata` as a JSON-string field) — multipart bodies cannot carry the
 * nested `withAuth` object shape.
 *
 * KNOWN CONTRACT GAP (server-side): today the endpoint only accepts `.pth`
 * trained artifacts (multer fileFilter) and parses its body with the
 * nested `withAuth` schema, so a browser-sent `.py` heuristic upload is
 * always rejected. Until the server accepts heuristic uploads with flat
 * multipart fields, every real attempt fails and the mock handles the
 * upload — which is why server rejections of ANY status fall back here,
 * unlike the other functions in this file.
 */
export async function uploadHeuristic(
  file: File,
  payload: UploadHeuristicPayload,
  onProgress?: (pct: number) => void,
  auth?: UserAuth,
): Promise<{ modelId: string; sourceRef: string }> {
  if (auth) {
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("auth", JSON.stringify(auth));
      form.set("displayName", payload.displayName);
      form.set(
        "metadata",
        JSON.stringify({
          game: payload.gameKey,
          adapterVersion: ADAPTER_VERSION,
          trainedAt: Date.now(),
        }),
      );
      const res = await api.post<ModelInfoWire>("/api/model/upload", form, {
        onUploadProgress: (e) => onProgress?.(Math.round((e.loaded / (e.total ?? 1)) * 100)),
      });
      return { modelId: res.data.modelId, sourceRef: res.data.artifactRef ?? "" };
    } catch {
      // Fall through to the mock upload (see CONTRACT GAP above).
      onProgress?.(0);
    }
  }
  const totalSteps = 6;
  for (let i = 1; i <= totalSteps; i++) {
    await new Promise((r) => setTimeout(r, 250));
    onProgress?.(Math.round((i / totalSteps) * 100));
  }
  // Allocate a new mock id.
  const nextId = `mock-model-${MOCK_MODELS.length + 1}`;
  const sourceRef = `s3://gnarena-mock/models/${nextId}/heuristic.py`;
  // Stash a lightweight stub so subsequent navigations to /trainer/jobs/:id
  // (which references model display name) can resolve it.
  MOCK_MODELS.push({
    id: nextId,
    displayName: payload.displayName || file.name.replace(/\.py$/, ""),
    gameKey: payload.gameKey,
    owner: { username: "user0", displayName: "The Knight Of Games" },
    visibility: payload.visibility,
    elo: 1000,
    winRate: 0,
    matchesPlayed: 0,
    forkCount: 0,
    hasActiveDeployment: false,
    hasCheckpoint: false,
    isStarterTemplate: false,
    createdAt: trainerDaysAgo(0),
    lastTrainedAt: trainerDaysAgo(0),
    jobIds: [],
    deploymentIds: [],
    sourceRef,
  });
  return { modelId: nextId, sourceRef };
}

/**
 * Forks an existing model (Story 2.13).
 *
 * TODO(@team): real endpoint pending — `POST /api/model/:modelId/fork`
 * with body `{ auth, payload: ForkModelPayload }` → 201 ModelInfo. No
 * server route exists yet, so this is mock-only; when it lands, mirror the
 * real-first shape used by `getModel` above.
 */
export async function forkModel(
  modelId: string,
  payload: ForkModelPayload,
): Promise<{ modelId: string }> {
  const parent = findMockModel(modelId);
  if (!parent) return Promise.reject(new Error(`Model not found: ${modelId}`));
  const nextId = `mock-model-${MOCK_MODELS.length + 1}`;
  MOCK_MODELS.push({
    ...parent,
    id: nextId,
    displayName: payload.displayName,
    visibility: payload.visibility,
    owner: { username: "user0", displayName: "The Knight Of Games" },
    forkedFrom: parent.id,
    forkCount: 0,
    matchesPlayed: 0,
    hasActiveDeployment: false,
    hasCheckpoint: false,
    isStarterTemplate: false,
    createdAt: trainerDaysAgo(0),
    lastTrainedAt: trainerDaysAgo(0),
    jobIds: [],
    deploymentIds: [],
    sourceRef: `s3://gnarena-mock/models/${nextId}/heuristic.py`,
  });
  parent.forkCount += 1;
  return delay({ modelId: nextId }, MOCK_LATENCY_MS);
}

/**
 * Returns the canned hello-world template (Story 2.12).
 *
 * TODO(@team): real endpoint pending — `GET /api/model/template/hello-world`.
 * Static content; mock-only until templates live server-side.
 */
export async function getHelloWorldTemplate(): Promise<{ source: string; name: string }> {
  return delay({ source: mockHelloWorld.source, name: mockHelloWorld.name }, MOCK_LATENCY_MS);
}

/*
 * Featured strips for the models discovery page. Mock-only: they are
 * cross-user aggregations and the server has no global model list yet (see
 * the TODO on `listModels`). When `GET /api/model/list` lands, derive these
 * from it the way `replayService.listFeaturedReplays` plans to.
 */
export async function listTopModelsPerGame(): Promise<ModelSummary[]> {
  return delay(topModelPerGame(), MOCK_LATENCY_MS);
}

export async function listRecentlyForkedModels(): Promise<ModelSummary[]> {
  return delay(recentlyForkedModels(), MOCK_LATENCY_MS);
}

export async function listStarterTemplateModels(): Promise<ModelSummary[]> {
  return delay(starterTemplateModels(), MOCK_LATENCY_MS);
}

/**
 * Convenience helper used by the lineage tree component.
 *
 * Mock-only: the server doesn't track fork lineage yet (depends on the
 * fork endpoint above). Walks the fixture's `forkedFrom` chain.
 */
export async function getModelLineage(
  modelId: string,
): Promise<{ ancestors: ModelSummary[]; descendants: ModelSummary[] }> {
  const target = findMockModel(modelId);
  if (!target) return Promise.reject(new Error(`Model not found: ${modelId}`));
  const ancestors: ModelSummary[] = [];
  let cur = target.forkedFrom ? findMockModel(target.forkedFrom) : undefined;
  while (cur) {
    ancestors.push(cur);
    cur = cur.forkedFrom ? findMockModel(cur.forkedFrom) : undefined;
  }
  const descendants = MOCK_MODELS.filter((m) => m.forkedFrom === modelId);
  return delay({ ancestors, descendants }, MOCK_LATENCY_MS);
}

/** Used by the new training form helpers. Pure client-side heuristic. */
export function gameKeyFromFile(file: File): TrainerGameKey | undefined {
  const name = file.name.toLowerCase();
  if (name.includes("nim")) return "nim";
  if (name.includes("guess")) return "guess";
  if (name.includes("connect")) return "connect4";
  if (name.includes("check")) return "checkers";
  if (name.includes("tic")) return "tictactoe";
  return undefined;
}
