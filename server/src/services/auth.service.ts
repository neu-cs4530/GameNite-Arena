import { AuthRepo } from "../repository.ts";
import type { UserWithId } from "../types.ts";
import type { UserAuth } from "@gamenite/shared";

/**
 * Retrieves a single user from the database.
 *
 * @param username - The username of the user to find
 * @returns the found user object (without the password) or null
 */
export async function getUserByUsername(username: string): Promise<UserWithId | null> {
  const auth = await AuthRepo.find(username);
  if (!auth) return null;
  return { userId: auth.userId, username };
}

/**
 * Create or update the authentication information associated with a specific
 * username
 *
 * @param username
 * @param password
 * @param userId the User model connected to this username
 */
export async function updateAuth(username: string, password: string, userId: string) {
  await AuthRepo.set(username, { password, userId: userId });
}

/**
 * Takes a username and password, and either returns the corresponding user object
 * (without the password) or null if the username/password combination does not
 * match stored values.
 *
 * @param auth - A user's authentication information (username and password)
 * @returns the corresponding user object (without the password) or null.
 */
export async function checkAuth({ username, password }: UserAuth): Promise<UserWithId | null> {
  const auth = await AuthRepo.find(username);
  if (!auth) return null;
  if (password !== auth.password) return null;
  return { username, userId: auth.userId };
}

/**
 * Takes a username and password, and returns the corresponding user
 * (without the password) or an error if the username/password combination
 * doesn't match stored values.
 *
 * @param auth - A user's authentication information (username and password)
 * @returns the corresponding user object (without the password)
 * @throws if the auth information is incorrect
 */
export async function enforceAuth(auth: UserAuth): Promise<UserWithId> {
  const user = await checkAuth(auth);
  if (!user) throw new Error("Invalid auth");
  return user;
}
