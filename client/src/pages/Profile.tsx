import "./Profile.css";
import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import useProfile from "../hooks/useProfile.ts";
import useReplaysForUser from "../hooks/useReplaysForUser.ts";
import useReplayFilters from "../hooks/useReplayFilters.ts";
import useWatchLater from "../hooks/useWatchLater.ts";
import useLoginContext from "../hooks/useLoginContext.ts";

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
import { MOCK_REPLAYS } from "../__mocks__/replays.ts";
import { replayGameNames } from "../util/consts.ts";

import EditProfileSettings from "./EditProfileSettings.tsx";
import { listReplaysForUser } from "../services/replayService.ts";
import type { ReplaySummary } from "../util/types.ts";

const PROFILE_MATCHES_PER_PAGE = 12;

type ProfileTab = "matches" | "settings" | "watch-later";

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: viewer } = useLoginContext();
  const isOwner = viewer.username === username;
  const tabParam = searchParams.get("tab");
  const tab: ProfileTab =
    tabParam === "settings" || tabParam === "watch-later" ? tabParam : "matches";

  const { profile, loading: profileLoading, error: profileError } = useProfile(username);
  const { filters, setFilter, setFilters, clearFilters } = useReplayFilters({
    pageSize: PROFILE_MATCHES_PER_PAGE,
    forUser: username,
  });
  const { page, loading: matchesLoading } = useReplaysForUser(username, filters);
  const watchLater = useWatchLater();

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
    return (
      <div className="ga-profile">
        <ErrorState title="User not found" body={`We couldn't find a user named "${username}".`} />
      </div>
    );
  }

  return (
    <div className="ga-profile">
      <ProfileHeader
        profile={profile}
        loading={profileLoading}
        isOwner={isOwner}
        onTabChange={setTab}
        activeTab={tab}
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
          <ProfileStats profile={profile} loading={profileLoading} />

          <ActivityHeatmap username={username} />

          <Section
            title="Recent matches"
            subtitle="Filter and browse this user's replays."
            testId="profile-recent-matches"
          >
            <ReplayFilterBar
              filters={filters}
              setFilter={setFilter}
              setFilters={setFilters}
              onClear={clearFilters}
              showPresets
            />

            {matchesLoading && replaysToShow.length === 0 ? (
              <MatchGrid replays={[]} loading skeletonCount={6} />
            ) : replaysToShow.length === 0 ? (
              <EmptyState
                icon="?"
                title="No replays match these filters"
                body="Try widening your Elo range or clearing a filter."
                action={<Button onClick={clearFilters}>Clear filters</Button>}
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
        </>
      )}

      {tab === "watch-later" && (
        <WatchLaterTab username={username} watchLaterIds={watchLater.ids} />
      )}
    </div>
  );
}

interface ProfileHeaderProps {
  profile: ReturnType<typeof useProfile>["profile"];
  loading: boolean;
  isOwner: boolean;
  activeTab: ProfileTab;
  onTabChange: (next: ProfileTab) => void;
}

function ProfileHeader({ profile, loading, isOwner, activeTab, onTabChange }: ProfileHeaderProps) {
  if (loading || !profile) {
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

  const { user, perGame, overallElo, joinedAt } = profile;
  return (
    <Card className="ga-profile-header" testId="profile-header">
      <div className="ga-profile-header__main">
        <Avatar name={user.display} size="xl" />
        <div className="ga-profile-header__textcol">
          <div className="ga-profile-header__name-row">
            <h1 className="ga-profile-header__display">{user.display}</h1>
            <span className="ga-profile-header__handle">@{user.username}</span>
          </div>
          <div className="ga-profile-header__since">
            Joined <TimeAgo date={joinedAt} />
          </div>
          <div className="ga-profile-header__chips" data-testid="profile-elo-chips">
            <div className="ga-profile-header__overall" data-testid="overall-elo">
              <span className="ga-profile-header__overall-num">{overallElo}</span>
              <span className="ga-profile-header__overall-label">overall Elo</span>
            </div>
            <TierBadge rating={overallElo} withRating />
            {perGame.map((g) => (
              <Badge variant="default" testId="elo-chip" key={g.gameKey}>
                {replayGameNames[g.gameKey]} - {g.rating}
              </Badge>
            ))}
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
          Matches
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

interface ProfileStatsProps {
  profile: ReturnType<typeof useProfile>["profile"];
  loading: boolean;
}

function ProfileStats({ profile, loading }: ProfileStatsProps) {
  if (loading || !profile) {
    return (
      <Card className="ga-profile-stats" testId="profile-stats-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={60} />
        ))}
      </Card>
    );
  }
  const { totalMatches, wins, losses, draws, currentStreak } = profile;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  return (
    <Card className="ga-profile-stats" testId="profile-stats">
      <Stat label="Matches" value={totalMatches} />
      <Stat label="Wins" value={wins} variant="success" />
      <Stat label="Losses" value={losses} variant="danger" />
      <Stat label="Draws" value={draws} />
      <Stat label="Win rate" value={`${winRate}%`} variant="info" />
      <Stat label="Win streak" value={currentStreak} variant="accent" />
    </Card>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?: "success" | "danger" | "info" | "accent";
}) {
  return (
    <div className={`ga-stat ga-stat--${variant ?? "default"}`}>
      <div className="ga-stat__value">{value}</div>
      <div className="ga-stat__label">{label}</div>
    </div>
  );
}

function WatchLaterTab({
  username,
  watchLaterIds,
}: {
  username: string | undefined;
  watchLaterIds: string[];
}) {
  const summaries: ReplaySummary[] = watchLaterIds
    .map((id) => MOCK_REPLAYS.find((r) => r.matchId === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map(({ moves: _moves, gameId: _gameId, initialState: _initial, ...rest }) => rest);
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
