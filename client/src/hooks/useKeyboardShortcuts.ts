import { useEffect } from "react";

export interface KeyboardShortcut {
  /** Key (KeyboardEvent.key, lowercased before comparison). */
  key: string;
  /** Optional modifiers. Defaults to "no modifiers required". */
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  /** Optional human-readable hint shown in the help overlay. */
  hint?: string;
  /** Optional group / category in the help overlay. */
  group?: string;
}

interface UseKeyboardShortcutsOptions {
  /** When true, shortcuts are ignored regardless of focus. */
  disabled?: boolean;
}

/**
 * Global keyboard shortcut hook. Skips when the user is typing in an
 * editable element (input / textarea / contenteditable) so the annotation
 * input doesn't trigger playback while the user is composing text.
 */
export default function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {},
) {
  const { disabled = false } = options;

  useEffect(() => {
    if (disabled) return;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && isEditable(target)) return;

      for (const s of shortcuts) {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue;
        // When a modifier is left undefined, accept either state. Specifying
        // `shift: true` requires the modifier; `shift: false` rejects it.
        // This keeps the "?" overlay reachable whether the test runner emits
        // the key event with or without the shiftKey bit set.
        if (s.shift !== undefined && s.shift !== e.shiftKey) continue;
        if (s.ctrl !== undefined && s.ctrl !== e.ctrlKey) continue;
        if (s.meta !== undefined && s.meta !== e.metaKey) continue;
        if (s.alt !== undefined && s.alt !== e.altKey) continue;
        // Found a match.
        s.handler(e);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, disabled]);
}

function isEditable(el: HTMLElement): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
