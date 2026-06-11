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
}

/** A value with a one-click copy button. */
export default function CopyField({
  value,
  label,
  mono = true,
  testId,
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

  return (
    <div className="ga-copy-field" data-testid={testId}>
      {label && <span className="ga-copy-field__label">{label}</span>}
      <code className={`ga-copy-field__value${mono ? "" : " ga-copy-field__value--prose"}`}>
        {value}
      </code>
      <button
        type="button"
        className="ga-copy-field__button"
        onClick={() => void copy()}
        data-testid={testId ? `${testId}-copy` : undefined}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
