import "./HeuristicSourcePicker.css";
import { useId, type JSX } from "react";
import UploadZone from "../ui/UploadZone.tsx";
import CheckpointPicker from "./CheckpointPicker.tsx";
import type { CheckpointSummary } from "../../util/types.ts";

export type HeuristicSourceMode = "upload" | "template" | "checkpoint";

interface HeuristicSourcePickerProps {
  mode: HeuristicSourceMode;
  onModeChange: (mode: HeuristicSourceMode) => void;
  /** Upload mode handlers. */
  onUpload: (file: File) => void;
  uploadProgress?: number;
  uploadedFileName?: string;
  /** Template mode preview source. */
  templateSource?: string;
  templateName?: string;
  /** Checkpoint mode list + selection. */
  checkpoints?: CheckpointSummary[];
  checkpointValue?: string | null;
  onCheckpointChange?: (id: string | null) => void;
}

const TABS: { value: HeuristicSourceMode; label: string }[] = [
  { value: "upload", label: "Upload .py file" },
  { value: "template", label: "Hello world template" },
  { value: "checkpoint", label: "Resume from checkpoint" },
];

/** Three-way segmented picker for the heuristic source. */
export default function HeuristicSourcePicker({
  mode,
  onModeChange,
  onUpload,
  uploadProgress,
  uploadedFileName,
  templateSource,
  templateName,
  checkpoints,
  checkpointValue,
  onCheckpointChange,
}: HeuristicSourcePickerProps): JSX.Element {
  const id = useId();
  return (
    <div className="ga-heuristic-picker" data-testid="heuristic-source-picker">
      <div className="ga-heuristic-picker__tabs" role="tablist" aria-label="Heuristic source">
        {TABS.map((t) => {
          const active = mode === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ga-heuristic-picker__tab ${active ? "ga-heuristic-picker__tab--active" : ""}`.trim()}
              onClick={() => onModeChange(t.value)}
              data-testid={`heuristic-source-tab-${t.value}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="ga-heuristic-picker__panel">
        {mode === "upload" && (
          <UploadZone
            accept=".py"
            onUpload={onUpload}
            progress={uploadProgress}
            fileName={uploadedFileName}
            label="Drop a .py heuristic, or click to choose"
            hint="Must define a `choose_move(state)` function per the PyTorch adapter contract."
            testId="upload-zone"
          />
        )}
        {mode === "template" && (
          <>
            <strong>{templateName ?? "Hello, GameNite!"}</strong>
            <textarea
              id={`${id}-template`}
              className="ga-heuristic-picker__textarea"
              value={templateSource ?? ""}
              readOnly
              aria-label="Template source"
              data-testid="template-source"
            />
          </>
        )}
        {mode === "checkpoint" && (
          <CheckpointPicker
            checkpoints={checkpoints ?? []}
            value={checkpointValue ?? null}
            onChange={(id) => onCheckpointChange?.(id)}
          />
        )}
      </div>
    </div>
  );
}
