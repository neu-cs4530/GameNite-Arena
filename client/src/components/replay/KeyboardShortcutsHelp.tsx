import "./KeyboardShortcutsHelp.css";
import type { JSX } from "react";
import IconButton from "../ui/IconButton.tsx";

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  shortcuts: { keys: string; description: string; group?: string }[];
}

/**
 * Modal overlay listing keyboard shortcuts. Opens when the user presses `?`.
 */
export default function KeyboardShortcutsHelp({
  open,
  onClose,
  shortcuts,
}: KeyboardShortcutsHelpProps): JSX.Element | null {
  if (!open) return null;
  const groups = new Map<string, typeof shortcuts>();
  for (const s of shortcuts) {
    const g = s.group ?? "General";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  return (
    <div
      className="ga-help"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="help-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ga-help__card">
        <header className="ga-help__head">
          <h2>Keyboard shortcuts</h2>
          <IconButton
            aria-label="Close shortcuts overlay"
            icon="✕"
            variant="ghost"
            onClick={onClose}
            data-testid="help-overlay-close"
          />
        </header>
        <div className="ga-help__groups">
          {[...groups.entries()].map(([groupName, items]) => (
            <section className="ga-help__group" key={groupName}>
              <h3>{groupName}</h3>
              <ul>
                {items.map((s, i) => (
                  <li key={`${groupName}-${i}`}>
                    <kbd>{s.keys}</kbd>
                    <span>{s.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="ga-help__foot">
          Tap <kbd>?</kbd> any time to reopen this overlay.
        </footer>
      </div>
    </div>
  );
}
