import { type ChangeEvent, type SubmitEvent, useState } from "react";
import useAuth from "./useAuth.ts";
import { addCommentToThread } from "../services/threadService.ts";
import type { ThreadInfo } from "@gamenite/shared";

/**
 * Custom hook to manage comment creation form logic
 * @param threadId - id of the thread to add a comment to
 * @param firstPost - are there other known posts? (used for validation)
 * @param setThread - callback to update the parent page if thread is updated
 * @returns an object containing
 *  - Form value `comment`
 *  - Possibly-null error message `err`
 *  - Form handlers `handleInputChange` and `handleSubmit`
 */
export default function useNewCommentForm(
  threadId: string,
  firstPost: boolean,
  setThread: (thread: ThreadInfo) => void,
) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const auth = useAuth();

  function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setComment(e.target.value);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (comment.trim() === "") {
      setErr("Please put some text in the comment");
      return;
    }

    if (
      firstPost &&
      comment.trim().toLocaleLowerCase().startsWith("first") &&
      comment.length < 15
    ) {
      setErr("Please put some effort into the comment");
      return;
    }

    try {
      const newThread = await addCommentToThread(auth, threadId, comment);
      setErr(null);
      setThread(newThread);
      setComment("");
    } catch (err) {
      setErr(`${err}`);
    }
  }

  return { comment, err, handleInputChange, handleSubmit };
}
