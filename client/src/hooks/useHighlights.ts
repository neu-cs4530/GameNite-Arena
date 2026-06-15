import { useCallback } from "react";
import type { HighlightInfo } from "@gamenite/shared";
import useAsync, { type AsyncResult } from "./useAsync.ts";
import useAuth from "./useAuth.ts";
import { listMyHighlights } from "../services/highlightService.ts";

/**
 * The authed user's bookmarked highlights (Story 3.12). Snapshot fetched on
 * mount; `refetch` re-pulls after a new highlight is saved elsewhere.
 */
export default function useHighlights(): AsyncResult<HighlightInfo[]> {
  const auth = useAuth();
  const producer = useCallback(() => listMyHighlights(auth), [auth]);
  return useAsync(producer, [auth]);
}
