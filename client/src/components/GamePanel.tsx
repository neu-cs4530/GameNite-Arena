import "./GamePanel.css";
import { useEffect, useState } from "react";
import type { GameInfo } from "@gamenite/shared";
import { gameNames } from "../util/consts.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import GameDispatch from "../games/GameDispatch.tsx";
import useSocketsForGame from "../hooks/useSocketsForGame.ts";
import useTimeSince from "../hooks/useTimeSince.ts";
import Card from "./ui/Card.tsx";
import RecapPanel from "./recap/RecapPanel.tsx";
import { isViewDone, recapMode } from "../util/recap.ts";

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

  const recap = recapMode({ done, hasResult: result !== null, graceElapsed });

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
      {recap === "rated" && result && (
        <RecapPanel gameKey={type} result={result} userPlayerIndex={userPlayerIndex} />
      )}
      {recap === "casual" && (
        <Card className="ga-recap ga-recap--casual" testId="recap-casual">
          <h2 className="ga-recap__headline">Game over</h2>
          <p>Casual game — no Glicko changes.</p>
        </Card>
      )}
    </div>
  ) : (
    <div></div>
  );
}
