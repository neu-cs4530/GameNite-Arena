import "./ForfeitButton.css";
import { useState, type JSX } from "react";
import useAuth from "../../hooks/useAuth.ts";
import useLoginContext from "../../hooks/useLoginContext.ts";
import Button from "../ui/Button.tsx";

/**
 * Resign the current game. A player can forfeit on ANY turn — including while
 * an AI opponent is mid-move — so they are never stuck waiting on a model to
 * leave the game. The forfeit ends the match for both seats (the resigning
 * player loses); a two-click confirm guards against an accidental click.
 */
export default function ForfeitButton({ gameId }: { gameId: string }): JSX.Element {
  const auth = useAuth();
  const { socket } = useLoginContext();
  const [confirming, setConfirming] = useState(false);

  function forfeit(): void {
    socket.emit("gameForfeit", { auth, payload: gameId });
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="ga-forfeit" data-testid="forfeit-confirm">
        <span className="ga-forfeit__prompt">Forfeit this game?</span>
        <Button variant="danger" size="sm" onClick={forfeit} data-testid="forfeit-confirm-yes">
          Yes, forfeit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          data-testid="forfeit-cancel"
        >
          Keep playing
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="danger"
      size="sm"
      onClick={() => setConfirming(true)}
      data-testid="forfeit"
      title="Resign this game — the other player wins"
    >
      Forfeit
    </Button>
  );
}
