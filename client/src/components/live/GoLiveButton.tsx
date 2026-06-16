import "./GoLiveButton.css";
import { useState, type JSX } from "react";
import useAuth from "../../hooks/useAuth.ts";
import { createBroadcast } from "../../services/broadcastService.ts";
import Button from "../ui/Button.tsx";

type Status = "idle" | "starting" | "live" | "error";

/**
 * "Broadcast this game" control (Story 3.7): starts a live broadcast of the
 * in-progress game with a spectator delay (0–60s). The broadcaster STAYS in
 * their game — starting a broadcast just makes the game watchable from the Live
 * Games page; it doesn't navigate the player anywhere. Shows a "Broadcasting"
 * badge once it's live.
 */
export default function GoLiveButton({ gameId }: { gameId: string }): JSX.Element {
  const auth = useAuth();
  const [delaySec, setDelaySec] = useState(0);
  const [status, setStatus] = useState<Status>("idle");

  async function goLive(): Promise<void> {
    setStatus("starting");
    try {
      await createBroadcast(gameId, delaySec, auth);
      setStatus("live");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  if (status === "live") {
    return (
      <span
        className="ga-go-live__badge"
        data-testid="go-live-badge"
        title="This game is broadcasting — viewers can watch it from Live Games"
      >
        ● Broadcasting
      </span>
    );
  }

  return (
    <div className="ga-go-live">
      <Button
        variant="primary"
        size="sm"
        loading={status === "starting"}
        onClick={() => void goLive()}
        data-testid="go-live"
        title="Broadcast this game live"
      >
        {status === "error" ? "Try again" : "Broadcast this game"}
      </Button>
      <label className="ga-go-live__field">
        <span>Delay (s)</span>
        <input
          type="number"
          min={0}
          max={60}
          value={delaySec}
          onChange={(e) => setDelaySec(Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
          data-testid="go-live-delay"
        />
      </label>
    </div>
  );
}
