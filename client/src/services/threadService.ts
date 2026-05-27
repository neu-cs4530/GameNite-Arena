import { api } from "./api.ts";
import type {
  CreateThreadMessage,
  ErrorMsg,
  ThreadInfo,
  ThreadSummary,
  UserAuth,
} from "@gamenite/shared";

const THREAD_API_URL = `/api/thread`;

/**
 * Sends a GET request to get all threads
 */
export const threadList = async (): Promise<ThreadSummary[]> => {
  const res = await api.get<ThreadSummary[] | ErrorMsg>(`${THREAD_API_URL}/list`);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a GET request to get an individual thread
 */
export const threadInfo = async (id: string): Promise<ThreadInfo> => {
  const res = await api.get<ThreadInfo | ErrorMsg>(`${THREAD_API_URL}/${id}`);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to add a comment to a thread
 */
export const addCommentToThread = async (
  auth: UserAuth,
  id: string,
  payload: string,
): Promise<ThreadInfo> => {
  const res = await api.post<ThreadInfo | ErrorMsg>(`${THREAD_API_URL}/${id}/comment`, {
    auth,
    payload,
  });
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/**
 * Sends a POST request to create a new thread
 */
export const createThread = async (
  auth: UserAuth,
  payload: CreateThreadMessage,
): Promise<ThreadInfo> => {
  const res = await api.post<ThreadInfo | ErrorMsg>(`${THREAD_API_URL}/create`, {
    auth,
    payload,
  });
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};
