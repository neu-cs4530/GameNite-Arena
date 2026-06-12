import "./LeaderboardBoard.css";
import { useCallback, useMemo, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { GameKey } from "@gamenite/shared";
import Avatar from "../ui/Avatar.tsx";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import ErrorState from "../ui/ErrorState.tsx";
import Pagination from "../ui/Pagination.tsx";
import RatingEmblem from "../ui/RatingEmblem.tsx";
import Skeleton from "../ui/Skeleton.tsx";
import StatTile from "../ui/StatTile.tsx";
import UserLink from "../ui/UserLink.tsx";
import { FilterBar, MultiToggle, SearchInput, SortSelect } from "../filters/index.ts";
import useAsync from "../../hooks/useAsync.ts";
import useLoginContext from "../../hooks/useLoginContext.ts";
import { getLeaderboard } from "../../services/leaderboardService.ts";
import { gameNames } from "../../util/consts.ts";
import {
  applyBoardView,
  findSelfEntry,
  formatWinRate,
  pageCount,
  pageSlice,
} from "../../util/leaderboardView.ts";
import type {
  LeaderboardEntityFilter,
  LeaderboardEntry,
  LeaderboardSort,
} from "../../util/types.ts";

const FULL_PAGE_SIZE = 50;
const COMPACT_PAGE_SIZE = 10;

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

interface LeaderboardBoardProps {
  gameKey: GameKey;
  /**
   * Embedded mode for the per-game section pages: top 10 only, no self
   * strip (the host page has its own stats strip), no pagination, and a
   * "view full leaderboard" link instead.
   */
  compact?: boolean;
}

/**
 * One game's leaderboard: filters, self strip, rows, pagination. The single
 * board implementation — the Leaderboards tab renders it full-size and each
 * game's section page embeds it compact, so the two can never drift.
 */
export default function LeaderboardBoard({
  gameKey,
  compact = false,
}: LeaderboardBoardProps): JSX.Element {
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

  const pageSize = compact ? COMPACT_PAGE_SIZE : FULL_PAGE_SIZE;
  const entries = useMemo(() => board.data?.entries ?? [], [board.data]);
  const viewEntries = useMemo(
    () => applyBoardView(entries, { sort, search }),
    [entries, sort, search],
  );
  const paged = pageSlice(viewEntries, compact ? 1 : page, pageSize);
  const pages = pageCount(viewEntries.length, pageSize);

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
      {!compact && (
        <h2 className="ga-leaderboards__board-title">{gameNames[gameKey]} leaderboard</h2>
      )}

      {!compact &&
        (self ? (
          <Card density="compact" testId="lb-self-strip" className="ga-leaderboards__self">
            <span className="ga-leaderboards__self-label">Your standing</span>
            <div className="ga-leaderboards__self-tiles">
              <StatTile label="Your rank" value={`#${self.rank}`} testId="lb-self-rank" />
              <StatTile
                label="Your Glicko"
                value={Math.round(self.rating)}
                testId="lb-self-rating"
              />
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
        ))}

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
          {!compact && <Pagination current={page} total={pages} onChange={setPage} />}
        </>
      )}

      {compact && (
        <Link
          className="ga-leaderboards__full-link"
          to={`/leaderboards?game=${gameKey}`}
          data-testid="board-view-full"
        >
          View full {gameNames[gameKey]} leaderboard →
        </Link>
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
