import { useCallback } from "react";
import { getProfile } from "../services/userService.ts";
import type { ProfileDetail } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a user's profile including mocked ratings and stats. */
export default function useProfile(username: string | undefined) {
  const producer = useCallback(() => {
    if (!username) return Promise.reject(new Error("No username provided"));
    return getProfile(username);
  }, [username]);
  const result = useAsync<ProfileDetail>(producer, [username]);
  return {
    profile: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
