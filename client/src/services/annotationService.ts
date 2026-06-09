/**
 * Annotation service - mocked. Maintains an in-memory store seeded from
 * `mockAnnotations` so the UI feels stateful within a single page load.
 *
 * TODO(@team): real endpoints pending - see comments below for the planned
 *   REST shapes that will replace each mock.
 */

import type {
  AnnotationView,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
} from "../util/types.ts";
// import { api } from "./api.ts"; // re-enable when real endpoints land
import { mockAnnotations } from "../__mocks__/replays.ts";

/** Mocked latency for visible loading states. */
const MOCK_LATENCY_MS = 180;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Mutable per-match store. Deep clone the seed so test mutations are isolated. */
const annotationsStore: Record<string, AnnotationView[]> = {};
for (const [matchId, anns] of Object.entries(mockAnnotations)) {
  annotationsStore[matchId] = anns.map((a) => ({ ...a, reactions: { ...a.reactions } }));
}

let nextId = 1_000;

function newId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/**
 * Lists all annotations for a match.
 *
 * TODO(@team): real endpoint pending - GET /api/replay/:matchId/annotations.
 */
export async function listAnnotations(matchId: string): Promise<AnnotationView[]> {
  return delay((annotationsStore[matchId] ?? []).map((a) => ({ ...a })));
}

/**
 * Creates a new annotation.
 *
 * TODO(@team): real endpoint pending - POST /api/replay/:matchId/annotations.
 */
export async function createAnnotation(
  matchId: string,
  payload: CreateAnnotationPayload,
  author: { id: string; displayName: string },
): Promise<AnnotationView> {
  const newAnn: AnnotationView = {
    id: newId("ann"),
    matchId,
    moveIndex: payload.moveIndex,
    text: payload.text,
    marker: payload.marker,
    authorId: author.id,
    authorDisplayName: author.displayName,
    visibility: "private",
    createdAt: new Date().toISOString(),
    reactions: { thumbsUp: 0, thumbsDown: 0 },
  };
  annotationsStore[matchId] = [...(annotationsStore[matchId] ?? []), newAnn];
  return delay({ ...newAnn });
}

/**
 * Updates an existing annotation by id.
 *
 * TODO(@team): real endpoint pending - PUT /api/annotation/:id.
 */
export async function updateAnnotation(
  id: string,
  payload: UpdateAnnotationPayload,
): Promise<AnnotationView> {
  for (const [matchId, list] of Object.entries(annotationsStore)) {
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) {
      const updated: AnnotationView = {
        ...list[idx],
        text: payload.text ?? list[idx].text,
        marker: payload.marker === null ? undefined : (payload.marker ?? list[idx].marker),
        visibility: payload.visibility ?? list[idx].visibility,
        editedAt: new Date().toISOString(),
      };
      annotationsStore[matchId] = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
      return delay({ ...updated });
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/**
 * Deletes an annotation by id.
 *
 * TODO(@team): real endpoint pending - DELETE /api/annotation/:id.
 */
export async function deleteAnnotation(id: string): Promise<void> {
  for (const [matchId, list] of Object.entries(annotationsStore)) {
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) {
      annotationsStore[matchId] = [...list.slice(0, idx), ...list.slice(idx + 1)];
      return delay(undefined);
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/**
 * Generates a share link for the annotation. Sets `visibility` to "shared".
 *
 * TODO(@team): real endpoint pending - POST /api/annotation/:id/share.
 */
export async function createShareLink(id: string): Promise<{ url: string; token: string }> {
  for (const list of Object.values(annotationsStore)) {
    const ann = list.find((a) => a.id === id);
    if (ann) {
      const token = ann.shareToken ?? newId("share");
      ann.visibility = "shared";
      ann.shareToken = token;
      return delay({
        url: `${window.location.origin}/study/${token}`,
        token,
      });
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/**
 * Applies a +1 / -1 reaction delta to an annotation. The caller decides the
 * intent (set / clear / switch) and the counter follows.
 */
export async function reactToAnnotation(
  id: string,
  reaction: "thumbsUp" | "thumbsDown",
  delta: number = 1,
): Promise<AnnotationView> {
  for (const list of Object.values(annotationsStore)) {
    const ann = list.find((a) => a.id === id);
    if (ann) {
      ann.reactions = {
        ...ann.reactions,
        [reaction]: Math.max(0, ann.reactions[reaction] + delta),
      };
      return delay({ ...ann }, 60);
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/**
 * Lookup an annotation by share token (read-only study view).
 *
 * `"demo"` is a sentinel the e2e suite uses to assert the study route
 * renders end-to-end. It maps onto the fixture's first shared annotation
 * so the test sees a real annotated replay without having to first
 * extract a real token via a Share link click.
 */
export async function getAnnotationByShareToken(
  token: string,
): Promise<{ annotation: AnnotationView; matchId: string } | null> {
  for (const list of Object.values(annotationsStore)) {
    const found = list.find((a) => a.shareToken === token);
    if (found) return delay({ annotation: { ...found }, matchId: found.matchId }, 30);
  }
  if (token === "demo") {
    for (const list of Object.values(annotationsStore)) {
      const found = list.find((a) => a.visibility === "shared" && a.shareToken);
      if (found) return delay({ annotation: { ...found }, matchId: found.matchId }, 30);
    }
  }
  return delay(null, 30);
}
