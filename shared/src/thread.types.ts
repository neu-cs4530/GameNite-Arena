import { z } from "zod";
import { type SafeUserInfo } from "./user.types.ts";
import { type CommentInfo } from "./comment.types.ts";

/**
 * Represents a forum post as exposed to the client. In our code, we call
 * forum posts "threads" to avoid confusion with HTTP POST requests, but users
 * see forums as containing posts with comments.
 * - `threadId`: database key
 * - `title`: post title
 * - `text`: post contents
 * - `createdAt`: when the thread was posted
 * - `createdBy`: original poster of thread
 * - `comments`: replies to the thread
 */
export interface ThreadInfo {
  threadId: string;
  title: string;
  text: string;
  createdAt: Date;
  createdBy: SafeUserInfo;
  comments: CommentInfo[];
}

/**
 * Represents the summary information for a thread
 */
export interface ThreadSummary extends Omit<ThreadInfo, "text" | "comments"> {
  comments: number;
}

/*** TYPES USED IN THE THREAD API ***/

/**
 * Relevant information for creating a new discussion thread
 */
export type CreateThreadMessage = z.infer<typeof zCreateThreadMessage>;
export const zCreateThreadMessage = z.object({
  title: z.string(),
  text: z.string(),
});
