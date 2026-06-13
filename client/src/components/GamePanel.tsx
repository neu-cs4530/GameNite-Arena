import "./GamePanel.css";
import { useEffect, useState } from "react";
import type { GameInfo, MatchResultView } from "@gamenite/shared";
import { gameNames } from "../util/consts.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import GameDispatch from "../games/GameDispatch.tsx";
import useSocketsForGame from "../hooks/useSocketsForGame.ts";
import useTimeSince from "../hooks/useTimeSince.ts";
import Card from "./ui/Card.tsx";
import RecapPanel from "./recap/RecapPanel.tsx";
import RequeueStrip from "./recap/RequeueStrip.tsx";
import { getReplay } from "../services/replayService.ts";
import { isNotFound } from "../services/serviceFallback.ts";
import { isViewDone, recapMode, resultFromReplay } from "../util/recap.ts";
import { modelSeatFor, parseQueueSession, queueSessionKey } from "../util/requeuePolicy.ts";

/**
 * How long a finished game waits for a `gameResult` event before concluding
 * it was casual (rated results arrive within a beat of the final move).
 */
const CASUAL_GRACE_MS = 1500;

/**
 * A game panel allows viewing the status and players of a live game
 */
export default function GamePanel({
  gameId,
  type,
  players: initialPlayers,
  createdAt,
  minPlayers,
}: GameInfo) {
  const { user } = useLoginContext();
  const timeSince = useTimeSince();

  const { view, players, userPlayerIndex, hasWatched, joinGame, startGame, result } =
    useSocketsForGame(gameId, initialPlayers);

  // Casual games never get a gameResult; give rated results a grace period
  // so the rated recap never flashes a "casual" card first.
  const done = isViewDone(view);
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setGraceElapsed(true), CASUAL_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  // Refresh / late-join recovery: gameResult is a one-shot socket event, so
  // a remount after a rated match never sees it. Once the grace period runs
  // out with no result, ask the persisted match record (matchId === gameId)
  // whether the game was rated and synthesize the same result shape.
  const [recovered, setRecovered] = useState<null | MatchResultView>(null);
  const [recoverySettled, setRecoverySettled] = useState(false);
  useEffect(() => {
    if (!done || !graceElapsed || result !== null) return;
    let cancelled = false;
    getReplay(gameId)
      .then((replay) => {
        if (!cancelled) {
          setRecovered(resultFromReplay(replay));
          setRecoverySettled(true);
        }
      })
      .catch((err) => {
        // Only a 404 proves the match was never archived — genuinely casual.
        // A network/server failure proves nothing, so leave recovery
        // unsettled rather than render a false "casual" claim for a match
        // that may have been rated.
        if (!cancelled && isNotFound(err)) setRecoverySettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [done, graceElapsed, result, gameId]);

  const effectiveResult = result ?? recovered;
  const recap = recapMode({
    done,
    hasResult: effectiveResult !== null,
    graceElapsed,
    recoverySettled,
  });

  // The queue session (if any) ties this game to an auto-requeue run and
  // tells the recap when the viewer's MODEL held the seat. Read once — the
  // session only changes through the recap strip below.
  const [queueSession] = useState(() =>
    parseQueueSession(window.sessionStorage.getItem(queueSessionKey(type))),
  );
  const modelEntityId = modelSeatFor(queueSession, effectiveResult, players);
  // Only participants' recaps drive the requeue run: a bystander watching
  // someone else's game must never burn the viewer's requeue counter.
  const participated = userPlayerIndex >= 0 || modelEntityId !== null;

  return hasWatched ? (
    <div className="gamePanel">
      <div className="gameRoster">
        <h2>{gameNames[type]}</h2>
        <div className="smallAndGray">Game room created {timeSince(createdAt)}</div>
        <div className="dottedList">
          {players.map((player, index) => (
            <div className="dottedListItem" role="listitem" key={player.username}>
              {player.username === user.username
                ? `you are player #${index + 1}`
                : `Player #${index + 1} is ${player.display}`}
            </div>
          ))}
        </div>
        {
          // If the game hasn't started and user hasn't joined, they can join
          userPlayerIndex < 0 && !view && (
            <button className="primary narrow" onClick={joinGame}>
              Join Game
            </button>
          )
        }
        {
          // If the game hasn't started and the user has joined, they can start the game if a minimum number of players are present
          userPlayerIndex >= 0 && !view && players.length >= minPlayers && (
            <button className="primary narrow" onClick={startGame}>
              Start Game
            </button>
          )
        }
      </div>
      {view ? (
        <div className="gameFrame">
          <GameDispatch
            gameId={gameId}
            userPlayerIndex={userPlayerIndex}
            players={players}
            view={view}
          />
        </div>
      ) : (
        <div className="gameFrame waiting content">waiting for game to begin</div>
      )}
      {recap === "rated" && effectiveResult && (
        <RecapPanel
          gameKey={type}
          result={effectiveResult}
          userPlayerIndex={userPlayerIndex}
          modelEntityId={modelEntityId}
        />
      )}
      {recap === "casual" && (
        <Card className="ga-recap ga-recap--casual" testId="recap-casual">
          <h2 className="ga-recap__headline">Game over</h2>
          <p>Casual game — no Glicko changes.</p>
        </Card>
      )}
      {recap !== "none" && participated && <RequeueStrip gameKey={type} gameId={gameId} />}
    </div>
  ) : (
    <div></div>
  );
}
