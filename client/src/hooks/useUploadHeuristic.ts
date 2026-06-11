import { useCallback, useMemo, useState } from "react";
import type { UserAuth } from "@gamenite/shared";
import { uploadHeuristic } from "../services/modelService.ts";
import type { UploadHeuristicPayload } from "../util/types.ts";
import useLoginContext from "./useLoginContext.ts";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadHeuristicResult {
  upload: (file: File, payload: UploadHeuristicPayload) => Promise<{ modelId: string } | null>;
  progress: number;
  status: UploadStatus;
  modelId: string | null;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook that wraps `uploadHeuristic` with progress + status state.
 *
 * The viewer's `auth` pair is forwarded so the service can attempt the real
 * `POST /api/model/upload` first (it falls back to the mock until the
 * server accepts heuristic uploads — see the service header).
 */
export default function useUploadHeuristic(): UploadHeuristicResult {
  const { user, pass } = useLoginContext();
  const auth: UserAuth = useMemo(
    () => ({ username: user.username, password: pass }),
    [user.username, pass],
  );
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [modelId, setModelId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (file: File, payload: UploadHeuristicPayload) => {
      setError(null);
      setProgress(0);
      setStatus("uploading");
      try {
        const result = await uploadHeuristic(
          file,
          payload,
          (pct) => {
            setProgress(pct);
          },
          auth,
        );
        setStatus("success");
        setModelId(result.modelId);
        return { modelId: result.modelId };
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        setStatus("error");
        return null;
      }
    },
    [auth],
  );

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
    setStatus("idle");
    setModelId(null);
  }, []);

  return { upload, progress, status, modelId, error, reset };
}
