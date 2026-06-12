import "./HomePuzzleCard.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { GameKey } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import useDailyPuzzles from "../../hooks/useDailyPuzzles.ts";
import useLoginContext from "../../hooks/useLoginContext.ts";
import { gameNames, PUZZLE_GAME_KEYS } from "../../util/consts.ts";

/**
 * Home's daily-puzzle strip: today's puzzle game(s) with the viewer's REAL
 * solved-today state (from `?for=` / viewerAttempt) and a CTA into /puzzles.
 *
 * Home must never break on a puzzle outage: while loading, on fetch error,
 * or when no game has a puzzle today, this renders nothing at all — the
 * card only exists when there is a real puzzle to point at.
 */
export default function HomePuzzleCard(): JSX.Element | null {
  const { user } = useLoginContext();
  const puzzles = useDailyPuzzles(user.username);

  if (puzzles.data === null) return null;

  // games with a REAL puzzle today; errored/empty slots drop out silently
  const available = PUZZLE_GAME_KEYS.flatMap((key): { key: GameKey; solved: boolean }[] => {
    const slot = puzzles.data?.[key];
    if (slot === undefined || slot.status !== "ok" || slot.puzzle === null) return [];
    return [{ key, solved: slot.puzzle.viewerAttempt?.solved === true }];
  });
  if (available.length === 0) return null;

  return (
    <Card testId="home-puzzle-card" className="ga-home-puzzle">
      <div className="ga-home-puzzle__head">
        <h2 className="ga-home-puzzle__title">Daily puzzle</h2>
        <span className="ga-home-puzzle__sub">
          One position per game — solves build your streak.
        </span>
      </div>
      <div className="ga-home-puzzle__games">
        {available.map(({ key, solved }) => (
          <div key={key} className="ga-home-puzzle__game" data-testid={`home-puzzle-game-${key}`}>
            <span className="ga-home-puzzle__game-name">{gameNames[key]}</span>
            {solved ? (
              <Badge variant="success" testId={`home-puzzle-solved-${key}`}>
                Solved today ✓
              </Badge>
            ) : (
              <Badge variant="info">Unsolved</Badge>
            )}
          </div>
        ))}
      </div>
      <Link to="/puzzles" className="ga-home-puzzle__cta" data-testid="home-puzzle-cta">
        Play today's puzzle →
      </Link>
    </Card>
  );
}
