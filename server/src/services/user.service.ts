import { type SafeUserInfo, type UserUpdateRequest } from "@gamenite/shared";
import { getUserByUsername, updateAuth } from "./auth.service.ts";
import { DeploymentRepo, UserRepo } from "../repository.ts";

const disallowedUsernames = new Set(["login", "signup", "list"]);

/**
 * Retrieves a single user from the database. AI seats store their deployment
 * id where a user id would go (Story 2.6), so deployment ids are rendered as
 * synthetic AI users instead of failing the user lookup.
 *
 * @param userId - Valid user id, or the deployment id of a seated model.
 * @returns the found user object (without the password).
 * @throws if the id is neither a user nor a deployment.
 */
export async function populateSafeUserInfo(userId: string): Promise<SafeUserInfo> {
  const record = await UserRepo.find(userId);
  if (record) {
    return {
      username: record.username,
      display: record.display,
      createdAt: new Date(record.createdAt),
    };
  }
  const deployment = await DeploymentRepo.find(userId);
  if (deployment) {
    return {
      username: userId,
      display: deployment.displayName,
      createdAt: new Date(deployment.createdAt),
      isAi: true,
    };
  }
  // Same failure shape UserRepo.get would have produced before AI seats.
  throw new Error(`Failed to find key ${userId} in repository user`);
}

/**
 * Create and store a new user
 *
 * @param newUser - The user object to be saved, containing user details like username, password, etc.
 * @returns Resolves with the saved user object (without the password) or an error message.
 */
export async function createUser(
  username: string,
  password: string,
  createdAt: Date,
): Promise<SafeUserInfo | { error: string }> {
  if ((await getUserByUsername(username)) !== null) {
    return { error: "User already exists" };
  }
  if (disallowedUsernames.has(username)) {
    return { error: "That is not a permitted username" };
  }
  const id = await UserRepo.add({
    username,
    createdAt: createdAt.toISOString(),
    display: username,
    puzzleRatings: {},
    puzzleStreak: { current: 0, best: 0 },
    following: [],
  });
  await updateAuth(username, password, id);
  return {
    username,
    createdAt,
    display: username,
  };
}

/**
 * Retrieves a list of usernames from the database
 *
 * @param usernames - A list of usernames
 * @returns the SafeUserInfo objects corresponding to those users
 * @throws if any of the usernames are not valid
 */
export async function getUsersByUsername(usernames: string[]): Promise<SafeUserInfo[]> {
  return Promise.all(
    usernames.map(async (username) => {
      const user = await getUserByUsername(username);
      if (user === null) {
        throw new Error(`No user ${username}`);
      }
      return populateSafeUserInfo(user.userId);
    }),
  );
}

/**
 * Updates user information in the database
 *
 * @param username - A valid username for the user to update
 * @param updates - An object that defines the fields to be updated and their new values
 * @returns the updated user object (without the password)
 * @throws if the username does not exist in the database
 */
export async function updateUser(
  username: string,
  { display, password }: UserUpdateRequest,
): Promise<SafeUserInfo> {
  const user = await getUserByUsername(username);
  if (!user) throw new Error(`No user ${username}`);
  if (password !== undefined) await updateAuth(username, password, user.userId);
  const newUser = await UserRepo.get(user.userId);
  if (display !== undefined) newUser.display = display;
  await UserRepo.set(user.userId, newUser);
  return populateSafeUserInfo(user.userId);
}
