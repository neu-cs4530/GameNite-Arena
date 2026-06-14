import { api } from "./api.ts";
import type { ErrorMsg, SafeUserInfo, UserAuth, UserUpdateRequest } from "@gamenite/shared";

const USER_API_URL = `/api/user`;

/**
 * Sends a POST request to authenticate a user.
 */
export const loginUser = async (auth: UserAuth): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/login`, auth);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to update parts of a user's profile
 */
export const updateUser = async (
  auth: UserAuth,
  updates: UserUpdateRequest,
): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/${auth.username}`, {
    auth,
    payload: updates,
  });
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to create a user
 *
 * @param user - The user credentials (username and password) for login.
 * @returns The authenticated user object, or an error message.
 */
export const signupUser = async (user: UserAuth): Promise<SafeUserInfo> => {
  const res = await api.post<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/signup`, user);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a GET request for a user's data
 *
 * @param username - The username
 * @returns The user's information, or an error message.
 */
export const getUserById = async (username: string): Promise<SafeUserInfo> => {
  const res = await api.get<SafeUserInfo | ErrorMsg>(`${USER_API_URL}/${username}`);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};
