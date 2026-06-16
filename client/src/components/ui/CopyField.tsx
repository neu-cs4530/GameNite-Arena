import "./CopyField.css";
import { useState, type JSX } from "react";

interface CopyFieldProps {
  /** The exact text the copy button puts on the clipboard. */
  value: string;
  /** Optional short label rendered before the value. */
  label?: string;
  /** Render the value in a monospace block (commands, ids, hashes). */
  mono?: boolean;
  testId?: string;
  /**
   * Hide the value entirely and render only the copy button. For long, ugly
   * commands the reader only ever needs to copy — showing the full string
   * just clutters the page. The button still copies the complete value.
   */
  masked?: boolean;
  /** Override the idle button text (default "Copy", or "Copy command" when masked). */
  copyLabel?: string;
}

/** A value with a one-click copy button. */
export default function CopyField({
  value,
  label,
  mono = true,
  testId,
  masked = false,
  copyLabel,
}: CopyFieldProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — leave the
      // text selectable; nothing useful to surface.
    }
  }

  const idleLabel = copyLabel ?? (masked ? "Copy command" : "Copy");

  return (
    <div className={`ga-copy-field${masked ? " ga-copy-field--masked" : ""}`} data-testid={testId}>
      {label && <span className="ga-copy-field__label">{label}</span>}
      {!masked && (
        <code className={`ga-copy-field__value${mono ? "" : " ga-copy-field__value--prose"}`}>
          {value}
        </code>
      )}
      <button
        type="button"
        className="ga-copy-field__button"
        onClick={() => void copy()}
        aria-label={masked ? `${idleLabel} to clipboard` : undefined}
        data-testid={testId ? `${testId}-copy` : undefined}
      >
        {copied ? "Copied" : idleLabel}
      </button>
    </div>
  );
}
