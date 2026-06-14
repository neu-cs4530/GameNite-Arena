/**
 * A basic error object containing a message.
 *
 * Check for this type with the TypeScript conditional `if ('error' in obj)`
 */
export interface ErrorMsg {
  error: string;
}

export * from "./auth.types.ts";
export * from "./chat.types.ts";
export * from "./comment.types.ts";
export * from "./game.types.ts";
export * from "./message.types.ts";
export * from "./socket.types.ts";
export * from "./thread.types.ts";
export * from "./user.types.ts";
export * from "./replay.types.ts";
export * from "./broadcast.types.ts";
export * from "./follower.types.ts";
export * from "./trainingQueue.types.ts";
export * from "./trainingProgress.types.ts";
export * from "./trainingSession.types.ts";
export * from "./deployment.types.ts";
export * from "./puzzle.types.ts";
export * from "./profile.types.ts";
export * from "./trainingHeuristics.ts";
