import "./PlaybackControls.css";
import { useId, type JSX } from "react";
import IconButton from "../ui/IconButton.tsx";
import { PLAYBACK_SPEEDS } from "../../hooks/useReplayPlayback.ts";

interface PlaybackControlsProps {
  currentMove: number;
  totalMoves: number;
  isPlaying: boolean;
  speed: number;
  autoLoop: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onJump: (delta: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onSeek: (moveIndex: number) => void;
  onSpeedChange: (s: number) => void;
  onToggleAutoLoop: () => void;
}

export default function PlaybackControls({
  currentMove,
  totalMoves,
  isPlaying,
  speed,
  autoLoop,
  onPrev,
  onNext,
  onPlayPause,
  onJump,
  onSeekStart,
  onSeekEnd,
  onSeek,
  onSpeedChange,
  onToggleAutoLoop,
}: PlaybackControlsProps): JSX.Element {
  const fillPercent = totalMoves === 0 ? 0 : (currentMove / totalMoves) * 100;
  const speedId = useId();
  const loopId = useId();

  return (
    <div
      className="ga-playback"
      data-testid="playback-controls"
      role="group"
      aria-label="Playback controls"
    >
      <div className="ga-playback__row">
        <IconButton
          aria-label="Jump to first move"
          icon="⏮"
          variant="ghost"
          onClick={onSeekStart}
        />
        <IconButton
          aria-label="Rewind 5 moves"
          icon="⏪"
          variant="ghost"
          onClick={() => onJump(-5)}
        />
        <IconButton
          aria-label="Previous move"
          icon="◀"
          variant="ghost"
          onClick={onPrev}
          disabled={currentMove === 0}
        />
        <IconButton
          aria-label={isPlaying ? "Pause" : "Play"}
          icon={isPlaying ? "❚❚" : "▶"}
          variant="primary"
          size="lg"
          onClick={onPlayPause}
        />
        <IconButton
          aria-label="Next move"
          icon="▶"
          variant="ghost"
          onClick={onNext}
          // Next stays clickable even at the end: the playback hook
          // wraps to 0 when looping and no-ops otherwise. Keeping the
          // button enabled lets the e2e "loop OFF Next is a no-op"
          // contract assert the click outcome rather than wait on a
          // disabled control.
        />
        <IconButton
          aria-label="Forward 5 moves"
          icon="⏩"
          variant="ghost"
          onClick={() => onJump(5)}
        />
        <IconButton aria-label="Jump to last move" icon="⏭" variant="ghost" onClick={onSeekEnd} />

        <div className="ga-playback__divider" aria-hidden="true" />

        <label htmlFor={speedId} className="ga-playback__speed">
          <span className="ga-playback__speed-label">Speed</span>
          <select
            id={speedId}
            className="ga-playback__speed-select"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            aria-label="Playback speed"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="ga-playback__speed-display" data-testid="playback-speed">
            {speed}×
          </span>
        </label>

        <label htmlFor={loopId} className="ga-playback__loop">
          <input
            id={loopId}
            type="checkbox"
            checked={autoLoop}
            onChange={onToggleAutoLoop}
            aria-label="Loop playback"
          />
          <span className="ga-playback__loop-label">Loop</span>
        </label>
      </div>

      <div className="ga-playback__bar-row">
        <span className="ga-playback__counter">
          Move <strong data-testid="current-move-index">{currentMove}</strong> / {totalMoves}
        </span>
        <input
          type="range"
          className="ga-playback__bar"
          min={0}
          max={totalMoves}
          value={currentMove}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          aria-label="Playback timeline"
          style={{ ["--ga-fill" as string]: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
