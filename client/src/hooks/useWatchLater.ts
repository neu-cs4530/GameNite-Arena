import { useCallback, useEffect, useSyncExternalStore } from "react";
import { lsKeys } from "../util/consts.ts";

function readSet(): Set<string> {
  /* v8 ignore next -- SSR guard: window is always defined under the jsdom test env */
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(lsKeys.watchLater);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed))
      return new Set(parsed.filter((x): x is string => typeof x === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  /* v8 ignore next -- SSR guard: window is always defined under the jsdom test env */
  if (typeof window === "undefined") return;
  window.localStorage.setItem(lsKeys.watchLater, JSON.stringify([...set]));
}

const WATCH_LATER_EVENT = "ga:watchLater:changed";

/**
 * Single source of truth for the watch-later set. Using a module-level
 * store + `useSyncExternalStore` keeps every MatchCard rendered on the
 * page in lockstep with a single click — no stale per-component state.
 */
let storeSnapshot: ReadonlySet<string> = readSet();
const subscribers = new Set<() => void>();

function notify() {
  for (const sub of subscribers) sub();
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): ReadonlySet<string> {
  return storeSnapshot;
}

function setStore(next: Set<string>) {
  storeSnapshot = next;
  writeSet(next);
  notify();
  /* v8 ignore next -- SSR guard: window is always defined under the jsdom test env */
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WATCH_LATER_EVENT));
  }
}

/* v8 ignore next -- SSR guard: window is always defined under the jsdom test env */
if (typeof window !== "undefined") {
  // Cross-tab and cross-window sync (other tabs / page reloads).
  window.addEventListener("storage", () => {
    storeSnapshot = readSet();
    notify();
  });
}

/**
 * Watch-later persistence backed by localStorage. All consumers share a
 * single store so a click in one MatchCard updates every MatchCard
 * mounted on the page synchronously.
 */
export default function useWatchLater() {
  const set = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Re-sync from localStorage if it was mutated by something outside React
  // (e.g. an integration test calling `page.evaluate`). The event is also
  // dispatched by `setStore` itself; an extra subscribe is cheap.
  useEffect(() => {
    function onChanged() {
      storeSnapshot = readSet();
      notify();
    }
    window.addEventListener(WATCH_LATER_EVENT, onChanged);
    return () => {
      window.removeEventListener(WATCH_LATER_EVENT, onChanged);
    };
  }, []);

  const has = useCallback((matchId: string): boolean => set.has(matchId), [set]);

  const toggle = useCallback((matchId: string) => {
    const next = new Set(storeSnapshot);
    if (next.has(matchId)) next.delete(matchId);
    else next.add(matchId);
    setStore(next);
  }, []);

  const clear = useCallback(() => {
    setStore(new Set());
  }, []);

  return { ids: [...set], has, toggle, clear };
}
