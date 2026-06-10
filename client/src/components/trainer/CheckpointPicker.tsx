import "./CheckpointPicker.css";
import type { JSX } from "react";
import EmptyState from "../ui/EmptyState.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import type { CheckpointSummary } from "../../util/types.ts";

interface CheckpointPickerProps {
  checkpoints: CheckpointSummary[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/** Selects a checkpoint from a prior training run (Story 2.10). */
export default function CheckpointPicker({
  checkpoints,
  value,
  onChange,
}: CheckpointPickerProps): JSX.Element {
  if (checkpoints.length === 0) {
    return (
      <EmptyState
        title="No checkpoints available"
        body="Run at least one training job that saves checkpoints to use this option."
        testId="checkpoint-picker-empty"
      />
    );
  }
  return (
    <div className="ga-ckpt-picker" data-testid="checkpoint-picker">
      <div className="ga-ckpt-picker__list" role="radiogroup" aria-label="Choose a checkpoint">
        {checkpoints.map((c) => {
          const active = value === c.id;
          return (
            <label
              key={c.id}
              className={`ga-ckpt-row ${active ? "ga-ckpt-row--active" : ""}`.trim()}
              data-testid="checkpoint-item"
            >
              <input
                type="radio"
                name="checkpoint"
                checked={active}
                onChange={() => onChange(c.id)}
                aria-label={`Checkpoint at ${c.episodes.toLocaleString()} episodes`}
                style={{ marginRight: "var(--space-2)" }}
              />
              <div>
                <div className="ga-ckpt-row__title">
                  Checkpoint at {c.episodes.toLocaleString()} ep
                </div>
                <div className="ga-ckpt-row__meta">
                  <span>Mean reward {c.meanReward.toFixed(2)}</span>
                  <span>Win rate {(c.winRate * 100).toFixed(0)}%</span>
                  <TimeAgo date={c.savedAt} />
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
