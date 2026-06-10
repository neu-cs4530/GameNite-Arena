import "./StatusChips.css";
import type { JSX } from "react";

export type ChipKind = "running" | "queued" | "completed" | "failed" | "deployed";

interface StatusChipsProps {
  counts: Record<ChipKind, number>;
  /** The count IS the door: clicking opens the section, pre-filtered. */
  onOpen: (kind: ChipKind) => void;
}

const chipLabels: Record<ChipKind, string> = {
  running: "Running",
  queued: "Waiting",
  completed: "Completed",
  failed: "Failed",
  deployed: "Deployed",
};

const CHIP_ORDER: ChipKind[] = ["running", "queued", "completed", "failed", "deployed"];

/**
 * Tier-0 glance: one chip per non-zero state. Zero-count chips don't
 * render — when nothing is happening, nothing is shown.
 */
export default function StatusChips({ counts, onOpen }: StatusChipsProps): JSX.Element | null {
  const visible = CHIP_ORDER.filter((kind) => counts[kind] > 0);
  if (visible.length === 0) return null;

  return (
    <div className="ga-status-chips" data-testid="status-chips">
      {visible.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`ga-status-chips__chip ga-status-chips__chip--${kind}`}
          onClick={() => onOpen(kind)}
          data-testid={`status-chip-${kind}`}
        >
          <span className="ga-status-chips__count">{counts[kind]}</span>
          {chipLabels[kind]}
        </button>
      ))}
    </div>
  );
}
