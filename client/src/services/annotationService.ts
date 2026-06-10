/**
 * Annotation service — real-first with the in-memory mock store as the
 * fallback storage backend.
 *
 * PROPOSED REST CONTRACT for issue #33 (no server routes exist yet — every
 * call below already targets these paths and falls back to the mock store
 * on 404/network/5xx, so the day the routes land the client needs ZERO
 * changes):
 *
 *   GET    /api/replay/:matchId/annotations
 *            → 200 AnnotationView[]
 *   POST   /api/replay/:matchId/annotations
 *            body { auth, payload: CreateAnnotationPayload }
 *            → 201 AnnotationView   (author resolved from auth server-side)
 *   PATCH  /api/annotation/:id
 *            body { auth, payload: UpdateAnnotationPayload }
 *            → 200 AnnotationView   (owner-only)
 *   DELETE /api/annotation/:id
 *            body { auth, payload: {} }
 *            → 204                  (owner-only)
 *   POST   /api/annotation/:id/share
 *            body { auth, payload: {} }
 *            → 200 { url: string; token: string }   (sets visibility "shared")
 *   POST   /api/annotation/:id/react
 *            body { auth, payload: { reaction: "thumbsUp" | "thumbsDown"; delta: 1 | -1 } }
 *            → 200 AnnotationView
 *   GET    /api/annotation/shared/:token
 *            → 200 { annotation: AnnotationView; matchId: string } | 404
 *
 * All bodies follow the repo's `withAuth` convention (shared/src/auth.types.ts).
 *
 * Every operation has ONE code path: try the real route; if the response
 * says the route/record isn't there (404) or the transport failed
 * (network/5xx), the same operation runs against the in-memory store seeded
 * from `mockAnnotations`. Mutations are only attempted for real when the
 * caller supplies `auth` (reads need none). Other 4xx (validation, bad
 * credentials) surface to the caller.
 */

import type { UserAuth } from "@gamenite/shared";
import type {
  AnnotationView,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
} from "../util/types.ts";
import { api } from "./api.ts";
import { delay, isFallbackEligible } from "./serviceFallback.ts";
import { mockAnnotations } from "../__mocks__/replays.ts";

/** Mocked latency for visible loading states. */
const MOCK_LATENCY_MS = 180;

/* ---------------------------------------------------------------------------
 * Mock storage backend (fallback only — see header).
 * Mutable per-match store. Deep clone the seed so test mutations are isolated.
 * ------------------------------------------------------------------------- */

const annotationsStore: Record<string, AnnotationView[]> = {};
for (const [matchId, anns] of Object.entries(mockAnnotations)) {
  annotationsStore[matchId] = anns.map((a) => ({ ...a, reactions: { ...a.reactions } }));
}

let nextId = 1_000;

function newId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/* ---------------------------------------------------------------------------
 * Service functions — real-first, mock-store fallback.
 * ------------------------------------------------------------------------- */

/** Lists all annotations for a match. */
export async function listAnnotations(matchId: string): Promise<AnnotationView[]> {
  try {
    const res = await api.get<AnnotationView[]>(`/api/replay/${matchId}/annotations`);
    return res.data;
  } catch (err) {
    if (!isFallbackEligible(err)) throw err;
  }
  return delay(
    (annotationsStore[matchId] ?? []).map((a) => ({ ...a })),
    MOCK_LATENCY_MS,
  );
}

/**
 * Creates a new annotation. The real route derives the author from `auth`;
 * the mock backend uses the explicit `author` projection the hook already
 * has on hand.
 */
export async function createAnnotation(
  matchId: string,
  payload: CreateAnnotationPayload,
  author: { id: string; displayName: string },
  auth?: UserAuth,
): Promise<AnnotationView> {
  if (auth) {
    try {
      const res = await api.post<AnnotationView>(`/api/replay/${matchId}/annotations`, {
        auth,
        payload,
      });
      return res.data;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
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
  return delay({ ...newAnn }, MOCK_LATENCY_MS);
}

/** Updates an existing annotation by id. */
export async function updateAnnotation(
  id: string,
  payload: UpdateAnnotationPayload,
  auth?: UserAuth,
): Promise<AnnotationView> {
  if (auth) {
    try {
      const res = await api.patch<AnnotationView>(`/api/annotation/${id}`, { auth, payload });
      return res.data;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
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
      return delay({ ...updated }, MOCK_LATENCY_MS);
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/** Deletes an annotation by id. */
export async function deleteAnnotation(id: string, auth?: UserAuth): Promise<void> {
  if (auth) {
    try {
      // Axios sends DELETE bodies via `data` (withAuth convention).
      await api.delete(`/api/annotation/${id}`, { data: { auth, payload: {} } });
      return;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
  for (const [matchId, list] of Object.entries(annotationsStore)) {
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) {
      annotationsStore[matchId] = [...list.slice(0, idx), ...list.slice(idx + 1)];
      return delay(undefined, MOCK_LATENCY_MS);
    }
  }
  return Promise.reject(new Error(`Annotation not found: ${id}`));
}

/** Generates a share link for the annotation. Sets `visibility` to "shared". */
export async function createShareLink(
  id: string,
  auth?: UserAuth,
): Promise<{ url: string; token: string }> {
  if (auth) {
    try {
      const res = await api.post<{ url: string; token: string }>(`/api/annotation/${id}/share`, {
        auth,
        payload: {},
      });
      return res.data;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
  for (const list of Object.values(annotationsStore)) {
    const ann = list.find((a) => a.id === id);
    if (ann) {
      const token = ann.shareToken ?? newId("share");
      ann.visibility = "shared";
      ann.shareToken = token;
      return delay(
        {
          url: `${window.location.origin}/study/${token}`,
          token,
        },
        MOCK_LATENCY_MS,
      );
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
  auth?: UserAuth,
): Promise<AnnotationView> {
  if (auth) {
    try {
      const res = await api.post<AnnotationView>(`/api/annotation/${id}/react`, {
        auth,
        payload: { reaction, delta },
      });
      return res.data;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
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
 * Real route: `GET /api/annotation/shared/:token`. NOTE: until #33 lands, a
 * 404 can mean either "route missing" or "no such token" — both resolve
 * through the mock store, which returns `null` for unknown tokens, so the
 * semantics stay correct in every mode.
 *
 * `"demo"` is a sentinel the e2e suite uses to assert the study route
 * renders end-to-end. It maps onto the fixture's first shared annotation
 * so the test sees a real annotated replay without having to first
 * extract a real token via a Share link click.
 */
export async function getAnnotationByShareToken(
  token: string,
): Promise<{ annotation: AnnotationView; matchId: string } | null> {
  try {
    const res = await api.get<{ annotation: AnnotationView; matchId: string }>(
      `/api/annotation/shared/${token}`,
    );
    return res.data;
  } catch (err) {
    if (!isFallbackEligible(err)) throw err;
  }
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
