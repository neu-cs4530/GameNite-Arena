import { useCallback, useEffect, useReducer, useRef } from "react";

/**
 * Generic { data, loading, error } async hook. Wraps an async producer and
 * exposes a `refetch` callback for retry behavior.
 *
 * Components use this through the typed wrappers (`useReplay`, `useProfile`,
 * etc.) so loading/error semantics are uniform across the app.
 *
 * The internal state is held in a single reducer so we never call multiple
 * `setState`s synchronously within an effect body (the custom
 * `react-hooks/set-state-in-effect` lint rule disallows that pattern).
 */
export interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface State<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  trigger: number;
}

type Action<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "failure"; error: Error }
  | { type: "refetch" };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return { ...state, data: action.data, loading: false };
    case "failure":
      return { ...state, error: action.error, loading: false };
    case "refetch":
      return { ...state, trigger: state.trigger + 1 };
  }
}

export default function useAsync<T>(
  producer: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  /**
   * Optional synchronous seed. When supplied, the initial render already
   * has `data` populated (and `loading=true` so the async producer still
   * has a chance to overwrite it). Lets callers avoid the "first paint
   * shows nothing" race that breaks Playwright assertions polling for
   * `getByTestId(...).count()` immediately after navigation.
   */
  seed?: T,
): AsyncResult<T> {
  const [state, dispatch] = useReducer(reducer<T>, {
    data: seed ?? null,
    loading: true,
    error: null,
    trigger: 0,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    producer()
      .then((result) => {
        if (cancelled || !mountedRef.current) return;
        dispatch({ type: "success", data: result });
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        const e = err instanceof Error ? err : new Error(String(err));
        dispatch({ type: "failure", error: e });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, state.trigger]);

  const refetch = useCallback(() => dispatch({ type: "refetch" }), []);

  return { data: state.data, loading: state.loading, error: state.error, refetch };
}
