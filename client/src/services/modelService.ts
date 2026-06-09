/**
 * Trainer model-related service functions.
 *
 * All functions here are MOCKED: the real endpoints are not implemented yet.
 * They follow the same pattern as `replayService` — real signature, the real
 * `api.*` call commented out for swap-in, deterministic mock response.
 */

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
// import { api } from "./api.ts"; // re-enable when real endpoints land
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
function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Returns a paginated, filtered model list. */
export async function listModels(filters: ModelFilters): Promise<ModelListPage> {
  // TODO(@team): real endpoint pending — `GET /api/model/list`.
  // const res = await api.get<ModelListPage>("/api/model/list", { params: ... });
  // return res.data;
  const { models, total } = filterMockModels(filters);
  return delay({ models, total, page: filters.page, pageSize: filters.pageSize });
}

/** Fetches full detail for a single model id. */
export async function getModel(modelId: string): Promise<ModelDetail> {
  // TODO(@team): real endpoint pending — `GET /api/model/:modelId`.
  // const res = await api.get<ModelDetail>(`/api/model/${modelId}`);
  // return res.data;
  const m = findMockModel(modelId);
  if (!m) return Promise.reject(new Error(`Model not found: ${modelId}`));
  return delay({ ...m, jobIds: m.jobIds.slice(), deploymentIds: m.deploymentIds.slice() });
}

/** Returns computed-looking stats for the public model card (Story 2.11). */
export async function getModelCard(modelId: string): Promise<ModelCardStats> {
  // TODO(@team): real endpoint pending — `GET /api/model/:modelId/card`.
  // const res = await api.get<ModelCardStats>(`/api/model/${modelId}/card`);
  // return res.data;
  const m = findMockModel(modelId);
  if (!m) return Promise.reject(new Error(`Model not found: ${modelId}`));
  const stats: ModelCardStats = {
    modelId,
    winRate: m.winRate,
    averageMoveLatencyMs: 40 + Math.round((m.elo - 1000) / 20),
    perGameElo: [{ gameKey: m.gameKey, elo: m.elo }],
    totalMatchesPlayed: m.matchesPlayed,
    daysSinceLastTraining: Math.max(
      0,
      Math.round(
        (Date.parse(trainerDaysAgo(0)) - Date.parse(m.lastTrainedAt)) / (24 * 60 * 60 * 1000),
      ),
    ),
  };
  return delay(stats);
}

/** Uploads a `.py` heuristic file. The mock simulates a 1.5s upload. */
export async function uploadHeuristic(
  file: File,
  payload: UploadHeuristicPayload,
  onProgress?: (pct: number) => void,
): Promise<{ modelId: string; sourceRef: string }> {
  // TODO(@team): real endpoint pending — `POST /api/model/upload`.
  // const form = new FormData();
  // form.set("file", file);
  // form.set("payload", JSON.stringify(payload));
  // const res = await api.post<{ modelId: string; sourceRef: string }>("/api/model/upload", form, {
  //   onUploadProgress: (e) => onProgress?.(Math.round((e.loaded / (e.total ?? 1)) * 100)),
  // });
  // return res.data;
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

/** Forks an existing model (Story 2.13). */
export async function forkModel(
  modelId: string,
  payload: ForkModelPayload,
): Promise<{ modelId: string }> {
  // TODO(@team): real endpoint pending — `POST /api/model/:modelId/fork`.
  // const res = await api.post<{ modelId: string }>(`/api/model/${modelId}/fork`, payload);
  // return res.data;
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
  return delay({ modelId: nextId });
}

/** Returns the canned hello-world template (Story 2.12). */
export async function getHelloWorldTemplate(): Promise<{ source: string; name: string }> {
  // TODO(@team): real endpoint pending — `GET /api/model/template/hello-world`.
  return delay({ source: mockHelloWorld.source, name: mockHelloWorld.name });
}

/** Featured strips for the models discovery page. */
export async function listTopModelsPerGame(): Promise<ModelSummary[]> {
  return delay(topModelPerGame());
}

export async function listRecentlyForkedModels(): Promise<ModelSummary[]> {
  return delay(recentlyForkedModels());
}

export async function listStarterTemplateModels(): Promise<ModelSummary[]> {
  return delay(starterTemplateModels());
}

/** Convenience helper used by the lineage tree component. */
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
  return delay({ ancestors, descendants });
}

/** Used by the new training form helpers. */
export function gameKeyFromFile(file: File): TrainerGameKey | undefined {
  const name = file.name.toLowerCase();
  if (name.includes("nim")) return "nim";
  if (name.includes("guess")) return "guess";
  if (name.includes("connect")) return "connect4";
  if (name.includes("check")) return "checkers";
  if (name.includes("tic")) return "tictactoe";
  return undefined;
}
