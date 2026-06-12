import "./Leaderboards.css";
import { useCallback, useMemo, useState, type JSX } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { GameKey, PuzzleLeaderboardEntry, PuzzleLeaderboardScope } from "@gamenite/shared";
import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import Card from "../components/ui/Card.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import Pagination from "../components/ui/Pagination.tsx";
import RatingEmblem from "../components/ui/RatingEmblem.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import StatTile from "../components/ui/StatTile.tsx";
import UserLink from "../components/ui/UserLink.tsx";
import TierBadge from "../components/replay/TierBadge.tsx";
import { FilterBar, MultiToggle, SearchInput, SortSelect } from "../components/filters/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { getLeaderboard, getPuzzleLeaderboard } from "../services/leaderboardService.ts";
import { gameNames, PLAYABLE_GAME_KEYS, PUZZLE_GAME_KEYS } from "../util/consts.ts";
import {
  applyBoardView,
  findSelfEntry,
  formatWinRate,
  pageCount,
  pageSlice,
} from "../util/leaderboardView.ts";
import type { LeaderboardEntityFilter, LeaderboardEntry, LeaderboardSort } from "../util/types.ts";

const PAGE_SIZE = 50;

const SORT_OPTIONS: { value: LeaderboardSort; label: string }[] = [
  { value: "rating", label: "Glicko rating" },
  { value: "winRate", label: "Win %" },
  { value: "wins", label: "Games won" },
  { value: "gamesPlayed", label: "Games played" },
];

const ENTITY_OPTIONS: { value: LeaderboardEntityFilter; label: string }[] = [
  { value: "human", label: "Humans" },
  { value: "ai", label: "AIs" },
  { value: "all", label: "Both" },
];

/** Which family of boards is up: rated match Glicko or daily-puzzle Glicko. */
type BoardFamily = "matches" | "puzzles";

const FAMILY_OPTIONS: { value: BoardFamily; label: string }[] = [
  { value: "matches", label: "Matches" },
  { value: "puzzles", label: "Puzzles" },
];

/**
 * /leaderboards — mirrors the games portal flow: hero + the shared game
 * grid; picking a game discloses that game's board on the same page. A pill
 * control switches between the match boards and the daily-puzzle boards
 * (overall + one per puzzle game). Everything lives in the URL
 * (`?board=` + `?game=`) so boards stay linkable.
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
            <Board key={selectedGame} gameKey={selectedGame} />
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

/** One game's board: filters, self strip, rows, pagination. */
function Board({ gameKey }: { gameKey: GameKey }): JSX.Element {
  const { user } = useLoginContext();
  const [entityFilter, setEntityFilter] = useState<LeaderboardEntityFilter>("all");
  const [sort, setSort] = useState<LeaderboardSort>("rating");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // One fetch of the full board (the server caps it at 100 entries) so the
  // alternate sorts and the name search can run client-side over everything.
  const board = useAsync(
    useCallback(
      () => getLeaderboard(gameKey, { type: entityFilter, limit: 100 }),
      [gameKey, entityFilter],
    ),
    [gameKey, entityFilter],
  );

  const entries = useMemo(() => board.data?.entries ?? [], [board.data]);
  const viewEntries = useMemo(
    () => applyBoardView(entries, { sort, search }),
    [entries, sort, search],
  );
  const paged = pageSlice(viewEntries, page, PAGE_SIZE);
  const pages = pageCount(viewEntries.length, PAGE_SIZE);

  const self = findSelfEntry(entries, user.username);

  const activeCount = (entityFilter !== "all" ? 1 : 0) + (search.trim() !== "" ? 1 : 0);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "";

  function resetFilters(): void {
    setEntityFilter("all");
    setSort("rating");
    setSearch("");
    setPage(1);
  }

  return (
    <section className="ga-leaderboards__board" aria-label={`${gameNames[gameKey]} leaderboard`}>
      <h2 className="ga-leaderboards__board-title">{gameNames[gameKey]} leaderboard</h2>

      {self ? (
        <Card density="compact" testId="lb-self-strip" className="ga-leaderboards__self">
          <span className="ga-leaderboards__self-label">Your standing</span>
          <div className="ga-leaderboards__self-tiles">
            <StatTile label="Your rank" value={`#${self.rank}`} testId="lb-self-rank" />
            <StatTile label="Your Glicko" value={Math.round(self.rating)} testId="lb-self-rating" />
            <StatTile
              label="Your win %"
              value={formatWinRate(self.winRate)}
              testId="lb-self-winrate"
            />
          </div>
        </Card>
      ) : (
        board.data !== null &&
        entityFilter !== "ai" && (
          <p className="ga-leaderboards__self-empty" data-testid="lb-self-empty">
            Play rated matches to get ranked — <Link to="/games">find a game</Link>.
          </p>
        )
      )}

      <FilterBar
        onClear={resetFilters}
        activeCount={activeCount}
        clearable={activeCount > 0 || sort !== "rating"}
        compactSummary={
          <span className="ga-leaderboards__summary" data-testid="lb-summary">
            {viewEntries.length} ranked · sorted by {sortLabel}
          </span>
        }
        testId="lb-filter-bar"
      >
        <MultiToggle
          label="Players"
          singleSelect
          options={ENTITY_OPTIONS}
          value={[entityFilter]}
          onChange={([next]) => {
            setEntityFilter(next);
            setPage(1);
          }}
          testId="lb-entity-toggle"
        />
        <SortSelect
          value={sort}
          options={SORT_OPTIONS}
          onChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          testId="lb-sort"
        />
        <SearchInput
          label="Player"
          value={search}
          onChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
          placeholder="Search by name"
          testId="lb-search"
        />
      </FilterBar>

      {board.error ? (
        <ErrorState
          title="Could not load the leaderboard"
          body={board.error.message}
          retry={board.refetch}
        />
      ) : board.data === null ? (
        <div className="ga-leaderboards__rows" data-testid="lb-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="2.5rem" />
          ))}
        </div>
      ) : viewEntries.length === 0 ? (
        <EmptyState
          title={entries.length === 0 ? "No rated games yet" : "Nobody matches that search"}
          body={
            entries.length === 0 ? (
              <>
                Be the first on the board — <Link to="/games">play a rated match</Link>.
              </>
            ) : undefined
          }
          testId="lb-empty"
        />
      ) : (
        <>
          <div className="ga-leaderboards__rows" data-testid="lb-rows" role="list">
            {paged.map((entry) => (
              <BoardRow
                key={`${entry.entityType}:${entry.entityId}`}
                entry={entry}
                isSelf={self !== null && entry.entityId === self.entityId}
              />
            ))}
          </div>
          <Pagination current={page} total={pages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

/** One compact board row. Every name is a profile / model-card link. */
function BoardRow({ entry, isSelf }: { entry: LeaderboardEntry; isSelf: boolean }): JSX.Element {
  return (
    <div
      className={`ga-leaderboards__row${isSelf ? " ga-leaderboards__row--self" : ""}`}
      data-testid={isSelf ? "lb-row-self" : "lb-row"}
      role="listitem"
    >
      <span className="ga-leaderboards__rank">#{entry.rank}</span>
      <Avatar name={entry.displayName} size="sm" variant={entry.entityType} />
      <span className="ga-leaderboards__name">
        <UserLink
          name={entry.displayName}
          username={entry.username}
          modelId={entry.entityType === "ai" ? entry.entityId : undefined}
          type={entry.entityType}
        />
        {isSelf && <Badge variant="info">you</Badge>}
      </span>
      <Badge variant={entry.entityType}>{entry.entityType === "ai" ? "AI" : "Human"}</Badge>
      <RatingEmblem
        rating={Math.round(entry.rating)}
        rd={entry.rd}
        gamesPlayed={entry.gamesPlayed}
      />
      <span className="ga-leaderboards__stats">
        <span className="ga-leaderboards__stat" title="Rated games played">
          {entry.gamesPlayed} played
        </span>
        <span className="ga-leaderboards__stat" title="Rated games won">
          {entry.wins} won
        </span>
        <span className="ga-leaderboards__stat" title="Win percentage">
          {formatWinRate(entry.winRate)}
        </span>
      </span>
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
