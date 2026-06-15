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
 * The Highlight button (Story 3.12). Bookmarks the current moment of a match —
 * used by a player on the Game page, or by the broadcaster on the live viewer
 * (pass `broadcastId` there). Shows a brief confirmation, then resets.
 */
export default function HighlightButton({
  gameId,
  broadcastId,
}: {
  gameId: string;
  broadcastId?: string;
}): JSX.Element {
  const auth = useAuth();
  const [status, setStatus] = useState<Status>("idle");

  async function bookmark(): Promise<void> {
    setStatus("saving");
    try {
      await createHighlight(gameId, auth, { broadcastId });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={status === "saving"}
      onClick={() => void bookmark()}
      data-testid="highlight-button"
      title="Bookmark this moment"
    >
      {LABEL[status]}
    </Button>
  );
}
