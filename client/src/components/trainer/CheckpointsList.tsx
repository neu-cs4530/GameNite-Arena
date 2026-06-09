import type { JSX } from "react";
import Button from "../ui/Button.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import "./CheckpointPicker.css";
import type { CheckpointSummary } from "../../util/types.ts";

interface CheckpointsListProps {
  checkpoints: CheckpointSummary[];
  onResume: (checkpointId: string) => void;
  onDownload: (checkpointId: string) => void;
}

/** Renders saved checkpoints with per-row Resume / Download actions. */
export default function CheckpointsList({
  checkpoints,
  onResume,
  onDownload,
}: CheckpointsListProps): JSX.Element {
  if (checkpoints.length === 0) {
    return (
      <EmptyState
        title="No checkpoints saved"
        body="Checkpoints will appear here as training progresses."
        testId="checkpoints-list-empty"
      />
    );
  }
  return (
    <div className="ga-ckpt-picker" data-testid="checkpoint-picker">
      <div className="ga-ckpt-picker__list">
        {checkpoints.map((c) => (
          <div key={c.id} className="ga-ckpt-row" data-testid="checkpoint-item">
            <div>
              <div className="ga-ckpt-row__title">
                Checkpoint at {c.episodes.toLocaleString()} episodes
              </div>
              <div className="ga-ckpt-row__meta">
                <span>Mean reward {c.meanReward.toFixed(2)}</span>
                <span>Win rate {(c.winRate * 100).toFixed(0)}%</span>
                <TimeAgo date={c.savedAt} />
              </div>
            </div>
            <div className="ga-ckpt-row__actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResume(c.id)}
                data-testid={`checkpoint-resume-${c.id}`}
              >
                Resume
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDownload(c.id)}
                data-testid={`checkpoint-download-${c.id}`}
              >
                Download
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
