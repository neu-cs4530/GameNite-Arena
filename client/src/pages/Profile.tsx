import "./Profile.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ProfileSummary } from "@gamenite/shared";
import useAsync from "../hooks/useAsync.ts";
import useReplaysForUser from "../hooks/useReplaysForUser.ts";
import useReplayFilters from "../hooks/useReplayFilters.ts";
import useWatchLater from "../hooks/useWatchLater.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useLiveBroadcasts from "../hooks/useLiveBroadcasts.ts";
import { useFollowers } from "../hooks/useFollowerData.ts";
import { findLiveBroadcastForUser } from "../util/liveGames.ts";
import LiveDot from "../components/live/LiveDot.tsx";

import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import LoadMoreButton from "../components/ui/LoadMoreButton.tsx";
import Section from "../components/ui/Section.tsx";
import Skeleton, { SkeletonText } from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";

import ReplayFilterBar from "../components/filters/ReplayFilterBar.tsx";
import MatchGrid from "../components/replay/MatchGrid.tsx";
import TierBadge from "../components/replay/TierBadge.tsx";
import ActivityHeatmap from "../components/replay/ActivityHeatmap.tsx";
import BestAiCard from "../components/profile/BestAiCard.tsx";
import PuzzleStatsPanel from "../components/profile/PuzzleStatsPanel.tsx";
import ReplayHero from "../components/profile/ReplayHero.tsx";
import ScopePills from "../components/profile/ScopePills.tsx";
import ScopeStatPanel from "../components/profile/ScopeStatPanel.tsx";
import {
  isGameScope,
  parseProfileScope,
  SCOPE_PARAM,
  type ProfileScope,
} from "../components/profile/scopes.ts";
import { replayGameNames } from "../util/consts.ts";

import EditProfileSettings from "./EditProfileSettings.tsx";
import { getProfileSummary, ProfileNotFoundError } from "../services/profileService.ts";
import { getReplay, listReplaysForUser } from "../services/replayService.ts";
import type { ReplaySummary } from "../util/types.ts";

const PROFILE_MATCHES_PER_PAGE = 12;

type ProfileTab = "matches" | "settings" | "watch-later" | "followers";

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: viewer } = useLoginContext();
  const isOwner = viewer.username === username;
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab =
    tabParam === "settings" || tabParam === "watch-later" || tabParam === "followers"
      ? tabParam
      : "matches";
  const scope = parseProfileScope(searchParams.get(SCOPE_PARAM));

  // ONE real fetch powers every scope; pill switches are client-side only.
  const producer = useCallback(() => {
    if (!username) return Promise.reject(new Error("No username provided"));
    return getProfileSummary(username);
  }, [username]);
  const {
    data: summary,
    loading: profileLoading,
    error: profileError,
    refetch,
  } = useAsync<ProfileSummary>(producer, [username]);

  const { filters, setFilter, setFilters } = useReplayFilters({
    pageSize: PROFILE_MATCHES_PER_PAGE,
    forUser: username,
  });
  const { page, loading: matchesLoading } = useReplaysForUser(username, filters);
  const watchLater = useWatchLater();

  // Is this user currently a human player in a live broadcast? Drives the red
  // "watch live" indicator in the header. Best-effort: matched by username
  // against the enriched live list.
  const liveBroadcasts = useLiveBroadcasts();
  const liveBroadcastId = useMemo(
    () =>
      username
        ? findLiveBroadcastForUser(liveBroadcasts.data ?? [], username)?.broadcast.broadcastId
        : undefined,
    [liveBroadcasts.data, username],
  );

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const [extraReplays, setExtraReplays] = useState<ReplaySummary[]>([]);
  const [loadedPages, setLoadedPages] = useState<number>(1);
  const [lastFiltersKey, setLastFiltersKey] = useState(filtersKey);

  // Reset accumulator when filters change. Derived during render so we don't
  // call setState() synchronously inside an effect.
  if (lastFiltersKey !== filtersKey) {
    setLastFiltersKey(filtersKey);
    setExtraReplays([]);
    setLoadedPages(1);
  }

  const setTab = useCallback(
    (next: ProfileTab) => {
      const params = new URLSearchParams(searchParams);
      if (next === "matches") params.delete("tab");
      else params.set("tab", next);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  // Tracks which game scope last pinned the game filter, so entering a game
  // scope preselects it exactly once and the user stays free to change the
  // filters afterwards.
  const gamePinnedRef = useRef<ProfileScope | null>(null);

  const setScope = useCallback(
    (next: ProfileScope) => {
      const params = new URLSearchParams(searchParams);
      if (next === "general") params.delete(SCOPE_PARAM);
      else params.set(SCOPE_PARAM, next);
      // Scope changes re-baseline the replay area: a game scope preselects
      // its game (written through the same `?game=` the filter state reads),
      // General returns to all-games; both keep the newest-first baseline.
      params.delete("page");
      params.delete("sort");
      if (isGameScope(next)) {
        params.set("game", next);
        gamePinnedRef.current = next;
      } else {
        params.delete("game");
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  // Deep links (`?scope=nim` with no explicit `game=`) preselect the scoped
  // game in the filter area too. An explicit `game=` in the URL wins, and we
  // pin at most once per scope entry so chip removal isn't fought.
  useEffect(() => {
    if (!isGameScope(scope) || gamePinnedRef.current === scope) return;
    gamePinnedRef.current = scope;
    if (searchParams.has("game")) return;
    const params = new URLSearchParams(searchParams);
    params.set("game", scope);
    params.delete("sort");
    setSearchParams(params, { replace: true });
  }, [scope, searchParams, setSearchParams]);

  // "Clear filters" must clear ONLY the replay filters — not the profile's
  // own navigation params. The hook's clearFilters wipes the whole query
  // string, which would silently knock the page back to the General scope
  // (and lose the active tab). Preserve scope + tab, and the game
  // preselection when we're inside a game scope.
  const clearProfileFilters = useCallback(() => {
    const preserved = new URLSearchParams();
    const scopeVal = searchParams.get(SCOPE_PARAM);
    const tabVal = searchParams.get("tab");
    if (scopeVal) preserved.set(SCOPE_PARAM, scopeVal);
    if (tabVal) preserved.set("tab", tabVal);
    if (isGameScope(scope)) preserved.set("game", scope);
    setSearchParams(preserved);
  }, [searchParams, scope, setSearchParams]);

  const replaysToShow = useMemo<ReplaySummary[]>(() => {
    return [...(page?.replays ?? []), ...extraReplays];
  }, [page, extraReplays]);
  const totalAvailable = page?.total ?? replaysToShow.length;

  const loadMore = useCallback(async () => {
    if (!username) return;
    const nextPage = loadedPages + 1;
    const next = await listReplaysForUser(username, { ...filters, page: nextPage });
    setLoadedPages(nextPage);
    setExtraReplays((prev) => [...prev, ...next.replays]);
  }, [username, filters, loadedPages]);

  if (profileError) {
    // 404 means the user genuinely doesn't exist; anything else is a
    // transport/server failure and gets the standard retryable error state.
    if (profileError instanceof ProfileNotFoundError) {
      return (
        <div className="ga-profile">
          <ErrorState
            title="User not found"
            body={`We couldn't find a user named "${username}".`}
          />
        </div>
      );
    }
    return (
      <div className="ga-profile">
        <ErrorState retry={refetch} />
      </div>
    );
  }

  return (
    <div className="ga-profile">
      <ProfileHeader
        summary={summary}
        loading={profileLoading}
        isOwner={isOwner}
        onTabChange={setTab}
        activeTab={tab}
        liveBroadcastId={liveBroadcastId}
      />

      {tab === "settings" && isOwner && (
        <Section title="Settings" testId="profile-settings">
          <EditProfileSettings />
        </Section>
      )}

      {tab === "settings" && !isOwner && (
        <EmptyState
          icon="!"
          title="That tab is owner-only"
          body="Settings are only visible to the profile owner."
        />
      )}

      {tab === "matches" && (
        <>
          <ScopePills scope={scope} onChange={setScope} />

          {profileLoading || !summary ? (
            <Card className="ga-profile-scope-skeleton" testId="profile-stats-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={60} />
              ))}
            </Card>
          ) : scope === "puzzles" ? (
            <PuzzleStatsPanel stats={summary.puzzles} />
          ) : (
            <ScopedOverview summary={summary} scope={scope} />
          )}

          {scope !== "puzzles" && (
            <Section
              title="Recent matches"
              subtitle="Filter and browse this user's replays."
              testId="profile-recent-matches"
            >
              <ReplayFilterBar
                filters={filters}
                setFilter={setFilter}
                setFilters={setFilters}
                onClear={clearProfileFilters}
                showPresets
              />

              {matchesLoading && replaysToShow.length === 0 ? (
                <MatchGrid replays={[]} loading skeletonCount={6} />
              ) : replaysToShow.length === 0 ? (
                <EmptyState
                  icon="?"
                  title="No replays match these filters"
                  body="Try widening your Elo range or clearing a filter."
                  action={<Button onClick={clearProfileFilters}>Clear filters</Button>}
                />
              ) : (
                <>
                  <MatchGrid
                    replays={replaysToShow}
                    viewerUsername={username}
                    loading={matchesLoading}
                  />
                  {replaysToShow.length < totalAvailable && (
                    <LoadMoreButton
                      remaining={totalAvailable - replaysToShow.length}
                      onClick={() => void loadMore()}
                    />
                  )}
                </>
              )}
            </Section>
          )}
        </>
      )}

      {tab === "watch-later" && (
        <WatchLaterTab username={username} watchLaterIds={watchLater.ids} />
      )}

      {tab === "followers" && <FollowersTab username={username} />}
    </div>
  );
}

/**
 * Heatmap + stat tiles + hero (+ best-AI on General) for one non-puzzle
 * scope, all read from the matching slice of the single ProfileSummary.
 */
function ScopedOverview({
  summary,
  scope,
}: {
  summary: ProfileSummary;
  scope: Exclude<ProfileScope, "puzzles">;
}) {
  if (scope === "general") {
    const { general } = summary;
    return (
      <>
        <ActivityHeatmap grid={general.heatmap} />
        <ScopeStatPanel
          record={general.record}
          elo={{ peak: general.peakElo, average: general.averageElo }}
        />
        <div className="ga-profile-duo">
          <BestAiCard bestAi={general.bestAi} />
          <ReplayHero replay={general.mostViewed} />
        </div>
      </>
    );
  }

  const game = summary.perGame.find((g) => g.gameKey === scope);
  if (!game) {
    return (
      <EmptyState
        icon="?"
        title={`No ${replayGameNames[scope]} matches yet`}
        body="Stats for this game appear after the first match is archived."
        testId="profile-scope-empty"
      />
    );
  }
  return (
    <>
      <ActivityHeatmap
        grid={game.heatmap}
        subtitle={`${replayGameNames[scope]} matches per weekday / hour (UTC)`}
      />
      <ScopeStatPanel
        record={game.record}
        elo={{
          current: game.rating.current,
          peak: game.rating.peak,
          average: game.rating.average,
        }}
      />
      <ReplayHero replay={game.mostViewed} />
    </>
  );
}

interface ProfileHeaderProps {
  summary: ProfileSummary | null;
  loading: boolean;
  isOwner: boolean;
  activeTab: ProfileTab;
  onTabChange: (next: ProfileTab) => void;
  /** Set when this user is currently in a live broadcast; links to watch it. */
  liveBroadcastId?: string;
}

function ProfileHeader({
  summary,
  loading,
  isOwner,
  activeTab,
  onTabChange,
  liveBroadcastId,
}: ProfileHeaderProps) {
  if (loading || !summary) {
    return (
      <Card className="ga-profile-header" testId="profile-header-skeleton">
        <div className="ga-profile-header__main">
          <Skeleton variant="circle" width={88} height={88} />
          <div className="ga-profile-header__textcol">
            <SkeletonText lines={2} />
            <div className="ga-profile-header__chips">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width={70} height={20} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const { user, general, perGame, puzzles } = summary;
  // The headline figure is the user's General standing: peak across all
  // games, falling back to the mean of current ratings, honest "Unrated"
  // when neither exists.
  const overallElo = general.peakElo ?? general.averageElo;
  const ratedGames = perGame.filter((g) => g.rating.current !== null);
  const hasPuzzleData = puzzles.perGame.length > 0 || puzzles.overallRating !== null;
  return (
    <Card className="ga-profile-header" testId="profile-header">
      <div className="ga-profile-header__main">
        <Avatar name={user.display} size="xl" />
        <div className="ga-profile-header__textcol">
          <div className="ga-profile-header__name-row">
            <h1 className="ga-profile-header__display">{user.display}</h1>
            <span className="ga-profile-header__handle">@{user.username}</span>
            {liveBroadcastId && (
              <Link
                to={`/live/${liveBroadcastId}`}
                className="ga-profile-header__live"
                data-testid="profile-live-indicator"
                title="This player is in a live game — watch now"
              >
                <LiveDot label="LIVE — watch" />
              </Link>
            )}
          </div>
          <div className="ga-profile-header__since">
            Joined <TimeAgo date={new Date(user.createdAt)} />
          </div>
          <div className="ga-profile-header__chips" data-testid="profile-elo-chips">
            <div className="ga-profile-header__overall" data-testid="overall-elo">
              <span className="ga-profile-header__overall-num">
                {overallElo === null ? "Unrated" : Math.round(overallElo)}
              </span>
              <span className="ga-profile-header__overall-label">overall Elo</span>
            </div>
            {overallElo !== null && <TierBadge rating={Math.round(overallElo)} withRating />}
            {ratedGames.map((g) => (
              <Badge variant="default" testId="elo-chip" key={g.gameKey}>
                {replayGameNames[g.gameKey]} - {Math.round(g.rating.current ?? 0)}
              </Badge>
            ))}
            {hasPuzzleData && (
              <Badge variant="info" testId="elo-chip">
                Puzzles -{" "}
                {puzzles.overallRating === null ? "Unrated" : Math.round(puzzles.overallRating)}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="ga-profile-header__actions" role="tablist" aria-label="Profile tabs">
        <Button
          variant={activeTab === "matches" ? "primary" : "ghost"}
          onClick={() => onTabChange("matches")}
          aria-pressed={activeTab === "matches"}
          role="tab"
        >
          Overview
        </Button>
        <Button
          variant={activeTab === "followers" ? "primary" : "ghost"}
          onClick={() => onTabChange("followers")}
          aria-pressed={activeTab === "followers"}
          role="tab"
        >
          Followers
        </Button>
        {isOwner && (
          <Button
            variant={activeTab === "watch-later" ? "primary" : "ghost"}
            onClick={() => onTabChange("watch-later")}
            aria-pressed={activeTab === "watch-later"}
            role="tab"
          >
            Watch later
          </Button>
        )}
        {isOwner && (
          <Button
            variant={activeTab === "settings" ? "primary" : "ghost"}
            onClick={() => onTabChange("settings")}
            aria-pressed={activeTab === "settings"}
            role="tab"
          >
            Edit profile
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * SCAFFOLD: a user's followers. The backend isn't built yet, so the data hook
 * reports "unavailable" and we render an honest waiting-for-backend state
 * (never fabricated followers). The real-data branch is already wired for when
 * the backend lands.
 */
function FollowersTab({ username }: { username?: string }) {
  const { data, loading } = useFollowers(username);
  return (
    <Section title="Followers" testId="profile-followers">
      {loading ? (
        <Skeleton variant="rect" height={80} />
      ) : data?.available ? (
        data.data.users.length === 0 ? (
          <EmptyState icon="👤" title="No followers yet" />
        ) : (
          <ul className="ga-profile-followers" data-testid="profile-followers-list">
            {data.data.users.map((f) => (
              <li key={f.user.username} className="ga-profile-followers__item">
                <Avatar name={f.user.display} size="sm" />
                <Link to={`/profile/${f.user.username}`}>{f.user.display}</Link>
                <span className="ga-profile-followers__handle">@{f.user.username}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <EmptyState
          icon="🚧"
          title="Followers are coming soon"
          body="The follow system is still being built on the backend — this is where this player's followers will appear."
          testId="followers-waiting"
        />
      )}
    </Section>
  );
}

function WatchLaterTab({
  username,
  watchLaterIds,
}: {
  username: string | undefined;
  watchLaterIds: string[];
}) {
  // Resolve each starred id through the real-first replay service (real
  // matches and fixture entries both work; unknown ids are dropped).
  const [summaries, setSummaries] = useState<ReplaySummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(watchLaterIds.map((id) => getReplay(id).catch(() => null))).then((details) => {
      if (cancelled) return;
      setSummaries(
        details
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map(({ moves: _moves, gameId: _gameId, initialState: _initial, ...rest }) => rest),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [watchLaterIds]);

  if (summaries === null) {
    return (
      <Section title="Watch later" testId="profile-watch-later">
        <MatchGrid replays={[]} loading skeletonCount={Math.min(watchLaterIds.length || 1, 6)} />
      </Section>
    );
  }
  if (summaries.length === 0) {
    return (
      <Section title="Watch later" testId="profile-watch-later">
        <EmptyState
          title="Your watch later list is empty"
          body="Star a replay's card to add it here."
        />
      </Section>
    );
  }
  return (
    <Section title="Watch later" testId="profile-watch-later">
      <MatchGrid replays={summaries} viewerUsername={username} />
    </Section>
  );
}
