import "./MatchmakingQueue.css";
import { useCallback, useEffect, useReducer, type JSX } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { zGameKey, type GameKey } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import RatingEmblem from "../components/ui/RatingEmblem.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import StatTile from "../components/ui/StatTile.tsx";
import useAsync from "../hooks/useAsync.ts";
import useAuth from "../hooks/useAuth.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useQueueCounts from "../hooks/useQueueCounts.ts";
import {
  formatElapsed,
  initialMatchmakingState,
  matchmakingReducer,
} from "../hooks/matchmakingReducer.ts";
import { fetchRating, poolSize } from "../services/matchmakingService.ts";
import { gameNames } from "../util/consts.ts";

/**
 * Route guard: the path param is user-controlled, so the queue only mounts
 * (and only emits matchmakingJoin) for a real playable game key.
 */
export default function MatchmakingQueue(): JSX.Element {
  const { gameKey } = useParams();
  const parsed = zGameKey.safeParse(gameKey);

  if (!parsed.success) {
    return (
      <div className="ga-queue">
        <EmptyState
          title="Unknown game"
          body="There is no matchmaking queue for that game."
          action={<Link to="/games">Back to games</Link>}
          testId="queue-unknown-game"
        />
      </div>
    );
  }

  return <QueueScreen gameKey={parsed.data} />;
}

/**
 * The classic queue screen. All queue *decisions* live in the pure
 * matchmakingReducer; this component only wires socket events, the 1s
 * elapsed tick, and navigation onto it.
 */
function QueueScreen({ gameKey }: { gameKey: GameKey }): JSX.Element {
  const { socket, user } = useLoginContext();
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rated = searchParams.get("rated") === "true";

  const [state, dispatch] = useReducer(matchmakingReducer, initialMatchmakingState);
  const counts = useQueueCounts();

  const ratingResult = useAsync(
    useCallback(
      () => (rated ? fetchRating(gameKey, user.username) : Promise.resolve(null)),
      [rated, gameKey, user.username],
    ),
    [rated, gameKey, user.username],
  );

  /* Queue membership tracks this effect's lifetime exactly: join on mount,
   * leave on unmount (back button, found-navigation, anything). Events for
   * other games' queues are filtered here, not trusted by the reducer. */
  useEffect(() => {
    const handleFound = (payload: { gameId: string; gameKey: GameKey }) => {
      if (payload.gameKey !== gameKey) return;
      dispatch({ type: "found", gameId: payload.gameId });
    };
    const handleTimeout = (payload: { gameKey: GameKey }) => {
      if (payload.gameKey !== gameKey) return;
      dispatch({ type: "timeout" });
    };
    const handleWindow = (payload: { gameKey: GameKey; window: number }) => {
      if (payload.gameKey !== gameKey) return;
      dispatch({ type: "window", window: payload.window });
    };

    socket.on("matchFound", handleFound);
    socket.on("matchmakingTimeout", handleTimeout);
    socket.on("matchmakingWindowUpdate", handleWindow);
    socket.emit("matchmakingJoin", { auth, payload: { gameKey, rated } });
    dispatch({ type: "join" });

    return () => {
      socket.off("matchFound", handleFound);
      socket.off("matchmakingTimeout", handleTimeout);
      socket.off("matchmakingWindowUpdate", handleWindow);
      socket.emit("matchmakingLeave", { auth, payload: gameKey });
    };
  }, [socket, auth, gameKey, rated]);

  /* Elapsed timer only runs while actually searching. */
  const searching = state.phase === "searching";
  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(timer);
  }, [searching]);

  /* found is terminal — hand off to the game page. */
  useEffect(() => {
    if (state.phase !== "found") return;
    void navigate(`/game/${state.gameId}`);
  }, [state, navigate]);

  function cancel() {
    socket.emit("matchmakingLeave", { auth, payload: gameKey });
    dispatch({ type: "cancel" });
    void navigate("/games");
  }

  function requeue() {
    socket.emit("matchmakingJoin", { auth, payload: { gameKey, rated } });
    dispatch({ type: "join" });
  }

  return (
    <div className="ga-queue" data-testid="matchmaking-queue">
      <header className="ga-queue__header">
        <h1>{gameNames[gameKey]}</h1>
        <Badge variant={rated ? "info" : "default"}>{rated ? "Ranked" : "Casual"}</Badge>
      </header>

      {state.phase === "searching" && (
        <>
          <div className="ga-queue__searching" data-testid="queue-searching">
            <span className="ga-queue__pulse" aria-hidden="true" />
            <p className="ga-queue__status">Searching for an opponent…</p>
            <p className="ga-queue__timer" data-testid="queue-timer">
              {formatElapsed(state.elapsedSec)}
            </p>
          </div>

          <div className="ga-queue__stats">
            <StatTile
              label="Searching window"
              value={`±${state.window}`}
              sub="rating range"
              testId="stat-window"
            />
            <StatTile
              label="In queue"
              value={poolSize(counts, gameKey, rated)}
              sub={rated ? "ranked pool" : "casual pool"}
              testId="stat-in-queue"
            />
            {rated && (
              <StatTile
                label="Your rating"
                value={
                  ratingResult.data ? (
                    <RatingEmblem
                      rating={ratingResult.data.rating}
                      rd={ratingResult.data.rd}
                      gamesPlayed={ratingResult.data.gamesPlayed}
                      testId="queue-rating-emblem"
                    />
                  ) : ratingResult.error ? (
                    "—"
                  ) : (
                    <Skeleton variant="text" width="8rem" />
                  )
                }
                testId="stat-rating"
              />
            )}
          </div>

          <Button variant="secondary" onClick={cancel} data-testid="queue-cancel">
            Cancel
          </Button>
        </>
      )}

      {state.phase === "found" && (
        <p className="ga-queue__status" data-testid="queue-found">
          Match found — joining…
        </p>
      )}

      {state.phase === "timedOut" && (
        <EmptyState
          title="No match found"
          body="Nobody in your rating range queued up in time. Queue again?"
          action={
            <div className="ga-queue__timeout-actions">
              <Button variant="primary" onClick={requeue} data-testid="queue-again">
                Queue again
              </Button>
              <Button
                variant="ghost"
                onClick={() => void navigate("/games")}
                data-testid="queue-back"
              >
                Back to games
              </Button>
            </div>
          }
          testId="queue-timed-out"
        />
      )}
    </div>
  );
}
