import "./Leaderboards.css";
import { useCallback, useState, type JSX } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PuzzleLeaderboardEntry, PuzzleLeaderboardScope } from "@gamenite/shared";
import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import Pagination from "../components/ui/Pagination.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import UserLink from "../components/ui/UserLink.tsx";
import TierBadge from "../components/replay/TierBadge.tsx";
import LeaderboardBoard from "../components/leaderboard/LeaderboardBoard.tsx";
import { MultiToggle } from "../components/filters/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { getPuzzleLeaderboard } from "../services/leaderboardService.ts";
import { gameNames, PLAYABLE_GAME_KEYS, PUZZLE_GAME_KEYS } from "../util/consts.ts";
import { formatWinRate, pageCount } from "../util/leaderboardView.ts";

const PAGE_SIZE = 50;

/** Which family of boards is up: rated match Glicko or daily-puzzle Glicko. */
type BoardFamily = "matches" | "puzzles";

const FAMILY_OPTIONS: { value: BoardFamily; label: string }[] = [
  { value: "matches", label: "Matches" },
  { value: "puzzles", label: "Puzzles" },
];

/**
 * /leaderboards — mirrors the games portal flow: hero + the shared game
 * grid; picking a game discloses that game's board on the same page. A pill
 * control switches between the match boards (the shared LeaderboardBoard the
 * section pages also embed) and the daily-puzzle boards (overall + one per
 * puzzle game). Everything lives in the URL (`?board=` + `?game=`) so boards
 * stay linkable.
 */
export default function Leaderboards(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const family: BoardFamily = searchParams.get("board") === "puzzles" ? "puzzles" : "matches";
  const gameParam = searchParams.get("game");

  const selectedGame =
    family === "matches" ? (PLAYABLE_GAME_KEYS.find((key) => key === gameParam) ?? null) : null;

  // Puzzle boards default to the overall blend — there is always a board to
  // show, unlike the match side where the user picks a game first.
  const puzzleScope: PuzzleLeaderboardScope =
    PUZZLE_GAME_KEYS.find((key) => key === gameParam) ?? "overall";

  return (
    <div className="ga-leaderboards" data-testid="leaderboards-page">
      <PageHero
        title="Leaderboards"
        lede="The top Glicko ratings for every arena game — rated matches and daily puzzles."
      />

      <MultiToggle
        label="Boards"
        singleSelect
        options={FAMILY_OPTIONS}
        value={[family]}
        onChange={([next]) => setSearchParams(next === "puzzles" ? { board: "puzzles" } : {})}
        testId="lb-board-scope"
      />

      {family === "matches" ? (
        <>
          <GameSelectGrid
            games={PLAYABLE_GAME_KEYS.map((key) => ({
              key,
              label: gameNames[key],
              tagline: "Glicko top 100",
            }))}
            selectedKey={selectedGame}
            onSelect={(key) => setSearchParams({ game: key })}
            testIdPrefix="lb-game-tile"
          />

          {selectedGame ? (
            <LeaderboardBoard key={selectedGame} gameKey={selectedGame} />
          ) : (
            <p className="ga-leaderboards__pick-hint" data-testid="lb-pick-hint">
              Select a game above to see its leaderboard.
            </p>
          )}
        </>
      ) : (
        <>
          <GameSelectGrid
            games={[
              { key: "overall", label: "All puzzles", tagline: "Blended puzzle rating" },
              ...PUZZLE_GAME_KEYS.map((key) => ({
                key,
                label: gameNames[key],
                tagline: "Daily puzzle rating",
              })),
            ]}
            selectedKey={puzzleScope}
            onSelect={(key) => setSearchParams({ board: "puzzles", game: key })}
            testIdPrefix="lb-puzzle-tile"
          />

          <PuzzleBoard key={puzzleScope} scope={puzzleScope} />
        </>
      )}
    </div>
  );
}

/**
 * One puzzle board (a game's, or the overall blend): real fetch from
 * GET /api/puzzle/leaderboard, server-paginated. No filters here — puzzle
 * standings are humans-only and already ranked by rating.
 */
function PuzzleBoard({ scope }: { scope: PuzzleLeaderboardScope }): JSX.Element {
  const { user } = useLoginContext();
  const [page, setPage] = useState(1);

  const board = useAsync(
    useCallback(() => getPuzzleLeaderboard(scope, { page, limit: PAGE_SIZE }), [scope, page]),
    [scope, page],
  );

  const title = scope === "overall" ? "All puzzles" : `${gameNames[scope]} puzzles`;

  return (
    <section className="ga-leaderboards__board" aria-label={`${title} leaderboard`}>
      <h2 className="ga-leaderboards__board-title">{title} leaderboard</h2>

      {board.error ? (
        <ErrorState
          title="Could not load the puzzle leaderboard"
          body={board.error.message}
          retry={board.refetch}
        />
      ) : board.data === null ? (
        <div className="ga-leaderboards__rows" data-testid="puzzle-board-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="2.5rem" />
          ))}
        </div>
      ) : board.data.entries.length === 0 ? (
        <EmptyState
          title="No puzzle attempts yet"
          body={
            <>
              Be the first on the board — <Link to="/puzzles">solve today's puzzle</Link>.
            </>
          }
          testId="puzzle-board-empty"
        />
      ) : (
        <>
          <div className="ga-leaderboards__rows" data-testid="puzzle-board" role="list">
            {board.data.entries.map((entry) => (
              <PuzzleBoardRow
                key={entry.username}
                entry={entry}
                isSelf={entry.username === user.username}
              />
            ))}
          </div>
          <Pagination
            current={page}
            total={pageCount(board.data.total, board.data.pageSize)}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

/** One puzzle standings row: rank / player / rating / solves / solve-rate / streak. */
function PuzzleBoardRow({
  entry,
  isSelf,
}: {
  entry: PuzzleLeaderboardEntry;
  isSelf: boolean;
}): JSX.Element {
  return (
    <div
      className={`ga-leaderboards__row${isSelf ? " ga-leaderboards__row--self" : ""}`}
      data-testid="puzzle-board-row"
      role="listitem"
    >
      <span className="ga-leaderboards__rank">#{entry.rank}</span>
      <Avatar name={entry.displayName} size="sm" variant="human" />
      <span className="ga-leaderboards__name">
        <UserLink name={entry.displayName} username={entry.username} type="human" />
        {isSelf && <Badge variant="info">you</Badge>}
      </span>
      <span className="ga-leaderboards__puzzle-rating">
        <TierBadge rating={Math.round(entry.rating)} withRating />
        {entry.provisional && (
          <Badge variant="default" title="Rating still settling — solve more puzzles">
            provisional
          </Badge>
        )}
      </span>
      <span className="ga-leaderboards__stats">
        <span className="ga-leaderboards__stat" title="Puzzles solved / attempted">
          {entry.solves}/{entry.attempts} solved
        </span>
        <span className="ga-leaderboards__stat" title="Solve rate">
          {formatWinRate(entry.solveRate)}
        </span>
        <span className="ga-leaderboards__stat" title="Current streak (and best)">
          streak {entry.streakCurrent} · best {entry.streakBest}
        </span>
      </span>
    </div>
  );
}
