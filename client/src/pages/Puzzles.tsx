import "./Puzzles.css";
import { useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { GameKey } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import Card from "../components/ui/Card.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import Skeleton, { SkeletonText } from "../components/ui/Skeleton.tsx";
import { DailyPuzzleCard } from "../components/puzzles/index.ts";
import useDailyPuzzles, { type DailyPuzzleSlot } from "../hooks/useDailyPuzzles.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { gameNames, PUZZLE_GAME_KEYS } from "../util/consts.ts";

/**
 * The daily puzzles tab, progressive-disclosure style:
 *
 *   at rest    — hero + one tile per puzzle game, nothing else.
 *   on select  — that game's daily puzzle card loads below; the choice
 *                lives in `?game=` so puzzle links are shareable.
 *   on attempt — verdict, rating + streak tiles, and only then the
 *                solution (which arrives ON the attempt response).
 *
 * Tiles render from PUZZLE_GAME_KEYS (deducible games only), not the full
 * playable list — deep-linking `?game=` to a non-puzzle game like guess
 * falls back to the pick-a-game state instead of an unsolvable board.
 *
 * "Solved today ✓" markers are REAL: every puzzle is fetched with
 * `?for=<viewer>` and the badge reads `viewerAttempt.solved`, so it
 * survives refreshes and other devices — plus a session-local overlay so a
 * solve made right here flips the tile without a refetch.
 */
export default function Puzzles(): JSX.Element {
  const { user } = useLoginContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [solvedThisSession, setSolvedThisSession] = useState<Partial<Record<GameKey, boolean>>>({});

  const puzzles = useDailyPuzzles(user.username);

  const rawGame = searchParams.get("game");
  const selected = PUZZLE_GAME_KEYS.find((key) => key === rawGame) ?? null;

  // The daily cycle flips at UTC midnight — show the puzzle day, which can
  // differ from the local calendar day in the evening, and say why.
  const puzzleDay = dayjs(dayjs().toISOString().slice(0, 10)).format("dddd, MMMM D, YYYY");

  function isSolvedToday(key: GameKey): boolean {
    if (solvedThisSession[key]) return true;
    const slot = puzzles.data?.[key];
    return slot?.status === "ok" && slot.puzzle?.viewerAttempt?.solved === true;
  }

  /** The selected game's card slot: loading / error / empty / the card. */
  function renderSelected(key: GameKey): JSX.Element {
    const slot: DailyPuzzleSlot | undefined = puzzles.data?.[key];

    if (slot === undefined) {
      return (
        <Card testId="puzzle-card-loading">
          <Skeleton height={160} className="ga-puzzle-card__board-skeleton" />
          <SkeletonText lines={2} />
        </Card>
      );
    }

    if (slot.status === "error") {
      return (
        <Card>
          <ErrorState
            testId="puzzle-error"
            title="Couldn't load today's puzzle"
            retry={puzzles.refetch}
          />
        </Card>
      );
    }

    if (slot.puzzle === null) {
      return (
        <Card>
          <EmptyState
            testId="puzzle-empty"
            icon="◌"
            title={`No ${gameNames[key]} puzzle yet today`}
            body="Daily puzzles are mined from real finished matches. Play a match (or check back later) and one will appear."
          />
        </Card>
      );
    }

    return (
      <DailyPuzzleCard
        key={key}
        puzzle={slot.puzzle}
        onSolved={(gameKey) => setSolvedThisSession((prev) => ({ ...prev, [gameKey]: true }))}
      />
    );
  }

  return (
    <div className="ga-puzzles" data-testid="puzzles-page">
      <PageHero
        title="Daily puzzles"
        kicker={`${puzzleDay} · resets at UTC midnight`}
        lede="One position per game, mined from real archived matches. Pick a game to play today's puzzle — solves build your streak and your Puzzle Glicko."
      />

      <GameSelectGrid
        games={PUZZLE_GAME_KEYS.map((key) => ({ key, label: gameNames[key] }))}
        selectedKey={selected}
        onSelect={(key) => setSearchParams({ game: key })}
        renderTileExtra={(key) =>
          isSolvedToday(key as GameKey) ? (
            <Badge variant="success" testId={`puzzle-solved-${key}`}>
              Solved today ✓
            </Badge>
          ) : (
            <span className="ga-puzzles__tile-note">Daily puzzle</span>
          )
        }
        testIdPrefix="puzzle-game-tile"
      />

      {selected && <div className="ga-puzzles__card-slot">{renderSelected(selected)}</div>}
    </div>
  );
}
