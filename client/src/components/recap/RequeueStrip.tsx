import "./RequeueStrip.css";
import { useEffect, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import type { GameKey } from "@gamenite/shared";
import Button from "../ui/Button.tsx";
import {
  parseQueueSession,
  policyOf,
  queueHrefFromSession,
  queueSessionKey,
  recordGamePlayed,
  remainingGames,
  serializeQueueSession,
  shouldRequeue,
} from "../../util/requeuePolicy.ts";

/** How long the recap waits before sending the seat back to the queue. */
const COUNTDOWN_SECONDS = 5;

interface RequeueStripProps {
  gameKey: GameKey;
  /** The game that just finished — counted once against the requeue cap. */
  gameId: string;
}

/**
 * The small strip under the recap that keeps an auto-requeue run going:
 * counts the finished game against the session, offers "Queue again", and
 * when the policy allows it, navigates back to the queue after a visible,
 * cancellable countdown. Renders nothing when no queue session exists —
 * a game opened outside a queue run never grows queue chrome.
 */
export default function RequeueStrip({ gameKey, gameId }: RequeueStripProps): JSX.Element | null {
  const navigate = useNavigate();

  // Read + count exactly once per mount. recordGamePlayed is idempotent
  // per game id, so the StrictMode double-run of this initializer is safe.
  const [session] = useState(() => {
    const stored = parseQueueSession(window.sessionStorage.getItem(queueSessionKey(gameKey)));
    if (stored === null || stored.gameKey !== gameKey) return null;
    const counted = recordGamePlayed(stored, gameId);
    if (counted !== stored) {
      try {
        window.sessionStorage.setItem(queueSessionKey(gameKey), serializeQueueSession(counted));
      } catch {
        // Storage write failed — the in-memory count still drives this recap.
      }
    }
    return counted;
  });

  const auto = session !== null && shouldRequeue(policyOf(session));
  const [cancelled, setCancelled] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const counting = auto && !cancelled && secondsLeft > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  /* The countdown reaching zero is the navigation trigger. */
  useEffect(() => {
    if (session === null || !auto || cancelled || secondsLeft > 0) return;
    void navigate(queueHrefFromSession(session));
  }, [session, auto, cancelled, secondsLeft, navigate]);

  if (session === null) return null;

  const remaining = remainingGames(policyOf(session));
  const queueAgainLabel =
    session.autoRequeue && remaining !== null && remaining > 0
      ? `Queue again (${remaining} left)`
      : "Queue again";
  const capReached = session.autoRequeue && !auto;

  return (
    <div className="ga-requeue" data-testid="requeue-strip">
      <span className="ga-requeue__status">
        {auto && !cancelled ? (
          <span data-testid="requeue-countdown">Back to the queue in {secondsLeft}s…</span>
        ) : capReached ? (
          <span data-testid="requeue-done">
            Auto-requeue finished — {session.played} games this run.
          </span>
        ) : (
          <span>
            {session.played} game{session.played === 1 ? "" : "s"} this run.
          </span>
        )}
      </span>
      <span className="ga-requeue__actions">
        {auto && !cancelled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCancelled(true)}
            data-testid="requeue-cancel"
          >
            Stay here
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void navigate(queueHrefFromSession(session))}
          data-testid="requeue-again"
        >
          {queueAgainLabel}
        </Button>
      </span>
    </div>
  );
}
