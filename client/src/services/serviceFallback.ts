/**
 * Shared helpers for the "real-first, mock-fallback" service pattern.
 *
 * Every replay-viewer / trainer service hits its real REST endpoint first
 * and only falls back to the client mock fixture when the response signals
 * that real data simply isn't there yet:
 *
 *   - network failure (no server running, proxy down),
 *   - 5xx (endpoint exists but blew up),
 *   - per-id 404 where the caller opts in (ids like `mock-model-1` that
 *     only exist in the client fixture).
 *
 * Meaningful 4xx responses (validation errors, auth failures, business-rule
 * rejections like the deployment cap) are NEVER swallowed — they propagate
 * to the caller so the UI can surface them.
 *
 * Mirrors the helpers that `replayService.ts` keeps locally; new services
 * should import from here instead of re-copying them.
 */

import { AxiosError } from "axios";

/** True when the error is an HTTP 404 from the API. */
export function isNotFound(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

/**
 * True when the error is a network-level failure (no response at all) or a
 * 5xx. Non-Axios errors are treated as fallback-eligible too — they come
 * from the transport layer, not from app logic.
 */
export function isNetworkOrServerError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return true;
  if (!err.response) return true;
  return err.response.status >= 500;
}

/** True when the mock fallback should handle this error for a per-id GET. */
export function isFallbackEligible(err: unknown): boolean {
  return isNotFound(err) || isNetworkOrServerError(err);
}

/**
 * Resolves `value` after `ms` milliseconds. Used by the mock fallback paths
 * so loading states stay visible (and the e2e skeleton assertions hold).
 */
export function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
