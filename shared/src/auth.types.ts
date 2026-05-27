import { z } from "zod";

/**
 * Represents a username/password pair passed for authentication.
 */
export type UserAuth = z.infer<typeof zUserAuth>;
export const zUserAuth = z.object({
  username: z.string(),
  password: z.string(),
});

/**
 * If `zT` is the zod representation of type `T`, then `withAuth(zT)` is the
 * zod representation of the type `WithAuth<T>` that is used to validate
 * payloads of auth-containing client-to-server requests.
 */
export function withAuth<T extends z.ZodType>(
  zT: T,
): z.ZodObject<{ auth: typeof zUserAuth; payload: T }> {
  return z.object({ auth: zUserAuth, payload: zT });
}

/**
 * The type of client-to-server requests containing auth information as well
 * as a data payload.
 */
export interface WithAuth<T> {
  auth: UserAuth;
  payload: T;
}
