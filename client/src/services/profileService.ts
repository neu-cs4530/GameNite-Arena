import { isAxiosError } from "axios";
import type { ProfileSummary } from "@gamenite/shared";
import { api } from "./api.ts";

const PROFILE_API_URL = "/api/profile";

/**
 * Thrown when the server answers 404 for the requested username. The profile
 * page maps this (and only this) to its "User not found" state; every other
 * failure renders the generic retryable error state.
 */
export class ProfileNotFoundError extends Error {
  constructor(username: string) {
    super(`User not found: ${username}`);
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Fetches the aggregate `ProfileSummary` for one user — the single request
 * that powers every pill scope on the profile page (General, each game,
 * Puzzles). REAL data only: there is deliberately no mock fallback here; a
 * failed fetch surfaces as a rejected promise and the page renders an error
 * state.
 */
export async function getProfileSummary(username: string): Promise<ProfileSummary> {
  try {
    const res = await api.get<ProfileSummary>(`${PROFILE_API_URL}/${username}`);
    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) {
      throw new ProfileNotFoundError(username);
    }
    throw err;
  }
}
