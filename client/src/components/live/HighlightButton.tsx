import "./HighlightButton.css";
import { useState, type JSX } from "react";
import useAuth from "../../hooks/useAuth.ts";
import { createHighlight } from "../../services/highlightService.ts";
import Button from "../ui/Button.tsx";

type Status = "idle" | "saving" | "saved" | "error";

const LABEL: Record<Status, string> = {
  idle: "★ Highlight",
  saving: "Saving…",
  saved: "Highlighted ✓",
  error: "Try again",
};

/**
 * The Highlight control (Story 3.12) for the Game page: a player bookmarks the
 * game they're playing (captures the last default-window moves) with an
 * optional clip name. Shows a brief confirmation, then resets. (Live-broadcast
 * clipping lives in the LiveViewer's highlight section instead.)
 */
export default function HighlightButton({ gameId }: { gameId: string }): JSX.Element {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function bookmark(): Promise<void> {
    setStatus("saving");
    try {
      await createHighlight(auth, { gameId, note: name.trim() || undefined });
      setStatus("saved");
      setName("");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="ga-highlight-button">
      <input
        type="text"
        className="ga-highlight-button__name"
        placeholder="Clip name (optional)"
        maxLength={280}
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="highlight-name"
      />
      <Button
        variant="secondary"
        size="sm"
        loading={status === "saving"}
        onClick={() => void bookmark()}
        data-testid="highlight-button"
        title="Bookmark the last few moves of this game"
      >
        {LABEL[status]}
      </Button>
    </div>
  );
}
