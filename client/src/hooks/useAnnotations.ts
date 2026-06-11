import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { UserAuth } from "@gamenite/shared";
import {
  createAnnotation,
  createShareLink,
  deleteAnnotation,
  listAnnotations,
  reactToAnnotation,
  updateAnnotation,
} from "../services/annotationService.ts";
import type {
  AnnotationView,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
} from "../util/types.ts";
import useLoginContext from "./useLoginContext.ts";

interface State {
  annotations: AnnotationView[];
  loading: boolean;
  error: Error | null;
  trigger: number;
}

type Action =
  | { type: "start" }
  | { type: "success"; list: AnnotationView[] }
  | { type: "failure"; error: Error }
  | { type: "refetch" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return { ...state, annotations: action.list, loading: false };
    case "failure":
      return { ...state, error: action.error, loading: false };
    case "refetch":
      return { ...state, trigger: state.trigger + 1 };
  }
}

/**
 * Per-match annotation hook. Handles list / create / update / delete /
 * share / react. The service is fast enough that we just re-fetch after
 * mutation rather than maintaining a parallel optimistic store.
 *
 * Mutations carry the viewer's `auth` pair so the service can take its
 * real path (the proposed #33 routes use the repo's withAuth convention);
 * until those routes land the service transparently falls back to its
 * mock store.
 */
export default function useAnnotations(matchId: string | undefined) {
  const { user, pass } = useLoginContext();
  const auth: UserAuth = useMemo(
    () => ({ username: user.username, password: pass }),
    [user.username, pass],
  );
  const [state, dispatch] = useReducer(reducer, {
    annotations: [],
    loading: true,
    error: null,
    trigger: 0,
  });

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    dispatch({ type: "start" });
    listAnnotations(matchId)
      .then((list) => {
        if (cancelled) return;
        dispatch({ type: "success", list });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, state.trigger]);

  const refetch = useCallback(() => dispatch({ type: "refetch" }), []);

  const create = useCallback(
    async (payload: CreateAnnotationPayload) => {
      if (!matchId) return;
      try {
        await createAnnotation(
          matchId,
          payload,
          {
            id: `human:${user.username}`,
            displayName: user.display,
          },
          auth,
        );
        refetch();
      } catch (err) {
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    [matchId, user, auth, refetch],
  );

  const update = useCallback(
    async (id: string, payload: UpdateAnnotationPayload) => {
      try {
        await updateAnnotation(id, payload, auth);
        refetch();
      } catch (err) {
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    [auth, refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteAnnotation(id, auth);
        refetch();
      } catch (err) {
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    [auth, refetch],
  );

  const share = useCallback(
    async (id: string): Promise<{ url: string; token: string } | null> => {
      try {
        const result = await createShareLink(id, auth);
        refetch();
        return result;
      } catch (err) {
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return null;
      }
    },
    [auth, refetch],
  );

  const react = useCallback(
    async (id: string, reaction: "thumbsUp" | "thumbsDown", delta: 1 | -1 = 1) => {
      try {
        await reactToAnnotation(id, reaction, delta, auth);
        refetch();
      } catch (err) {
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    },
    [auth, refetch],
  );

  return {
    annotations: state.annotations,
    loading: state.loading,
    error: state.error,
    refetch,
    create,
    update,
    remove,
    share,
    react,
  };
}
