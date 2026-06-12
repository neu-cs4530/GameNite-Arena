import "./GameSection.css";
import { useCallback, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { zGameKey, type GameKey } from "@gamenite/shared";
import Card from "../components/ui/Card.tsx";
import Disclosure from "../components/ui/Disclosure.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import RatingEmblem from "../components/ui/RatingEmblem.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import StatTile from "../components/ui/StatTile.tsx";
import LeaderboardBoard from "../components/leaderboard/LeaderboardBoard.tsx";
import { MultiToggle, Toggle } from "../components/filters/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { getLeaderboard } from "../services/leaderboardService.ts";
import { fetchRating } from "../services/matchmakingService.ts";
import { listDeploymentViews } from "../services/trainerViewService.ts";
import { gameNames } from "../util/consts.ts";
import { formatWinRate } from "../util/leaderboardView.ts";
import {
  clampRequeueLimit,
  matchSettingsKey,
  parseMatchSettings,
  REQUEUE_LIMIT_OPTIONS,
  serializeMatchSettings,
  type MatchSettings,
} from "../util/matchSettings.ts";
import {
  activeDeploymentsFor,
  ctaState,
  deriveSelfStats,
  isAiPlayable,
  queueHref,
  resolveSeat,
  seatOptions,
  sectionLede,
  SELF_SEAT_VALUE,
} from "./gameSection.ts";

/**
 * Route guard: the path param is user-controlled, so the section page only
 * mounts for a real playable game key.
 */
export default function GameSection(): JSX.Element {
  const { gameKey } = useParams();
  const parsed = zGameKey.safeParse(gameKey);

  if (!parsed.success) {
    return (
      <div className="ga-game-section">
        <EmptyState
          title="Unknown game"
          body="There is no arena for that game."
          action={<Link to="/games">Back to games</Link>}
          testId="section-unknown-game"
        />
      </div>
    );
  }

  return <SectionScreen key={parsed.data} gameKey={parsed.data} />;
}

/**
 * One game's home: the Play CTAs front and center, then (for AI-playable
 * games) whose seat it is, match settings, your standing, and the board.
 * Every decision lives in the gameSection view-model; this component is
 * fetch + navigation wiring.
 */
function SectionScreen({ gameKey }: { gameKey: GameKey }): JSX.Element {
  const { user } = useLoginContext();
  const navigate = useNavigate();

  const aiPlayable = isAiPlayable(gameKey);

  /* Your active deployments for this game — the "Who plays?" choices. */
  const deploymentsResult = useAsync(
    useCallback(
      () => (aiPlayable ? listDeploymentViews(user.username) : Promise.resolve([])),
      [aiPlayable, user.username],
    ),
    [aiPlayable, user.username],
  );
  const myDeployments = activeDeploymentsFor(deploymentsResult.data ?? [], gameKey);

  const [seatValue, setSeatValue] = useState<string>(SELF_SEAT_VALUE);
  const seat = resolveSeat(seatValue, myDeployments);
  const cta = ctaState(seat);

  /* Your rating, shown inline on the Ranked CTA. */
  const ratingResult = useAsync(
    useCallback(() => fetchRating(gameKey, user.username), [gameKey, user.username]),
    [gameKey, user.username],
  );

  /* One fresh board fetch feeds both the stats strip and the self entry. */
  const boardResult = useAsync(
    useCallback(() => getLeaderboard(gameKey, { type: "all", fresh: true, limit: 100 }), [gameKey]),
    [gameKey],
  );
  const selfStats = deriveSelfStats(boardResult.data?.entries ?? [], user.username);

  /* Match settings persist per game; localStorage failures degrade silently. */
  const [settings, setSettings] = useState<MatchSettings>(() =>
    parseMatchSettings(window.localStorage.getItem(matchSettingsKey(gameKey))),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  function updateSettings(next: MatchSettings): void {
    setSettings(next);
    try {
      window.localStorage.setItem(matchSettingsKey(gameKey), serializeMatchSettings(next));
    } catch {
      // Quota / private browsing — the in-memory settings still apply.
    }
  }

  function play(rated: boolean): void {
    void navigate(queueHref(gameKey, rated, seat));
  }

  return (
    <div className="ga-game-section" data-testid="game-section">
      <PageHero title={gameNames[gameKey]} lede={sectionLede(gameKey)} />

      {/* The centerpiece: two big doors into the queue. */}
      <section className="ga-game-section__play" aria-label="Play">
        <button
          type="button"
          className="ga-game-section__cta"
          onClick={() => play(false)}
          disabled={!cta.enabled}
          data-testid="play-casual"
        >
          <span className="ga-game-section__cta-title">Casual</span>
          <span className="ga-game-section__cta-sub">Quick match — ratings stay untouched.</span>
        </button>
        <button
          type="button"
          className="ga-game-section__cta ga-game-section__cta--ranked"
          onClick={() => play(true)}
          disabled={!cta.enabled}
          data-testid="play-ranked"
        >
          <span className="ga-game-section__cta-title">Ranked</span>
          <span className="ga-game-section__cta-sub">
            {ratingResult.data ? (
              <RatingEmblem
                rating={ratingResult.data.rating}
                rd={ratingResult.data.rd}
                gamesPlayed={ratingResult.data.gamesPlayed}
                testId="play-ranked-rating"
              />
            ) : ratingResult.error ? (
              "Plays for Glicko — rating unavailable right now."
            ) : (
              <Skeleton variant="text" width="9rem" />
            )}
          </span>
        </button>
      </section>
      {!cta.enabled && cta.reason && (
        <p className="ga-game-section__cta-reason" role="alert" data-testid="play-disabled-reason">
          {cta.reason}
        </p>
      )}

      {aiPlayable && (
        <Card className="ga-game-section__seat" testId="who-plays">
          <h2 className="ga-game-section__panel-title">Who plays?</h2>
          {deploymentsResult.data === null && !deploymentsResult.error ? (
            <Skeleton variant="text" width="16rem" />
          ) : myDeployments.length === 0 ? (
            <p className="ga-game-section__seat-hint" data-testid="who-plays-empty">
              Just you for now — <Link to="/trainer">train and deploy a model</Link> and it can take
              this seat.
            </p>
          ) : (
            <>
              <MultiToggle
                label="Seat"
                singleSelect
                options={seatOptions(myDeployments).map((o) => ({
                  value: o.value,
                  label: o.rating !== undefined ? `${o.label} · ${o.rating}` : o.label,
                }))}
                value={[seat.kind === "self" ? SELF_SEAT_VALUE : seat.deployment.deploymentId]}
                onChange={(next) => setSeatValue(next[0] ?? SELF_SEAT_VALUE)}
                testId="who-plays-toggle"
              />
              {seat.kind === "deployment" && (
                <p className="ga-game-section__seat-note" data-testid="who-plays-note">
                  {seat.deployment.displayName} takes the seat and competes with its own rating —
                  you spectate the match.
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <Disclosure
        summary="Match settings"
        meta={
          settings.autoRequeue ? (
            <span className="ga-game-section__settings-meta">
              auto-requeue on{settings.requeueLimit > 0 ? ` · ${settings.requeueLimit} games` : ""}
            </span>
          ) : undefined
        }
        open={settingsOpen}
        onToggle={setSettingsOpen}
        testId="match-settings"
      >
        <div className="ga-game-section__settings">
          <Toggle
            label="Queue again automatically after each game"
            checked={settings.autoRequeue}
            onChange={(next) => updateSettings({ ...settings, autoRequeue: next })}
            testId="settings-auto-requeue"
          />
          <label className="ga-game-section__limit">
            <span className="ga-game-section__limit-label">Stop after</span>
            <select
              value={settings.requeueLimit}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  requeueLimit: clampRequeueLimit(Number(e.target.value)),
                })
              }
              disabled={!settings.autoRequeue}
              data-testid="settings-requeue-limit"
            >
              {REQUEUE_LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 0 ? "No limit" : `${option} games`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Disclosure>

      <section className="ga-game-section__stats" aria-label="Your standing">
        <h2 className="ga-game-section__panel-title">Your standing</h2>
        {boardResult.error ? (
          <p className="ga-game-section__stats-empty" data-testid="self-stats-error">
            Standing unavailable right now.
          </p>
        ) : boardResult.data === null ? (
          <div className="ga-game-section__tiles" data-testid="self-stats-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height="3.5rem" width="8rem" />
            ))}
          </div>
        ) : selfStats === null ? (
          <p className="ga-game-section__stats-empty" data-testid="self-stats-empty">
            No rated games yet — your first ranked match puts you on the board.
          </p>
        ) : (
          <div className="ga-game-section__tiles" data-testid="self-stats">
            <StatTile
              label="Your Glicko"
              value={selfStats.rating}
              sub={`rank #${selfStats.rank}`}
              testId="self-stat-rating"
            />
            <StatTile
              label="Win / loss"
              value={`${selfStats.wins} – ${selfStats.losses}`}
              sub={`${selfStats.gamesPlayed} rated games`}
              testId="self-stat-record"
            />
            <StatTile
              label="Win rate"
              value={formatWinRate(selfStats.winRate)}
              testId="self-stat-winrate"
            />
          </div>
        )}
      </section>

      <section className="ga-game-section__board" aria-label="Leaderboard">
        <h2 className="ga-game-section__panel-title">Top 10</h2>
        <LeaderboardBoard gameKey={gameKey} compact />
      </section>
    </div>
  );
}
