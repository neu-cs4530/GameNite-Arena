import "./UploadZone.css";
import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

interface UploadZoneProps {
  /** File-input `accept` attribute, e.g. `.py`. */
  accept?: string;
  /** Called with the selected `File` when the user picks or drops a file. */
  onUpload: (file: File) => void;
  /** Optional 0-100 progress; renders a progress bar when between 0 and 100 exclusive. */
  progress?: number;
  /** Optional override for the primary call-to-action label. */
  label?: string;
  /** Optional secondary hint text. */
  hint?: string;
  /** Name of the currently-selected file (for display after upload completes). */
  fileName?: string;
  testId?: string;
  className?: string;
  /** When true, ignore drops and clicks. */
  disabled?: boolean;
}

/**
 * Generic drag-and-drop file zone. Belongs to the UI primitives layer so other
 * surfaces (trainer heuristic upload, future avatar upload, etc.) can reuse it.
 */
export default function UploadZone({
  accept,
  onUpload,
  progress,
  label = "Drop a file here, or click to choose",
  hint,
  fileName,
  testId = "upload-zone",
  className = "",
  disabled,
}: UploadZoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reset so the same filename can be re-selected if needed.
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  const showProgress = typeof progress === "number" && progress > 0 && progress < 100;

  return (
    <div
      className={`ga-upload-zone ${dragging ? "ga-upload-zone--dragging" : ""} ${className}`.trim()}
      data-testid={testId}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={openPicker}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onKeyDown={handleKey}
      aria-disabled={disabled || undefined}
      aria-describedby={hint ? `${id}-hint` : undefined}
    >
      <span className="ga-upload-zone__icon" aria-hidden="true">
        ⇪
      </span>
      <span className="ga-upload-zone__title">{label}</span>
      {hint && (
        <span className="ga-upload-zone__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {fileName && (
        <span className="ga-upload-zone__file" data-testid={`${testId}-file`}>
          <span aria-hidden="true">⎙</span>
          {fileName}
        </span>
      )}
      {showProgress && (
        <div
          className="ga-upload-zone__progress"
          data-testid={`${testId}-progress`}
          aria-label="Upload progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="ga-upload-zone__progress-bar">
            <div className="ga-upload-zone__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="ga-upload-zone__hint">{progress}%</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="ga-upload-zone__input"
        data-testid={`${testId}-input`}
        aria-label={label}
        disabled={disabled}
      />
    </div>
  );
}
