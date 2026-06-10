import { useCallback, useState } from "react";
import { uploadHeuristic } from "../services/modelService.ts";
import type { UploadHeuristicPayload } from "../util/types.ts";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadHeuristicResult {
  upload: (file: File, payload: UploadHeuristicPayload) => Promise<{ modelId: string } | null>;
  progress: number;
  status: UploadStatus;
  modelId: string | null;
  error: Error | null;
  reset: () => void;
}

/** Hook that wraps `uploadHeuristic` with progress + status state. */
export default function useUploadHeuristic(): UploadHeuristicResult {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [modelId, setModelId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(async (file: File, payload: UploadHeuristicPayload) => {
    setError(null);
    setProgress(0);
    setStatus("uploading");
    try {
      const result = await uploadHeuristic(file, payload, (pct) => {
        setProgress(pct);
      });
      setStatus("success");
      setModelId(result.modelId);
      return { modelId: result.modelId };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
    setStatus("idle");
    setModelId(null);
  }, []);

  return { upload, progress, status, modelId, error, reset };
}
