import "./LiveNowCard.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import LiveTrainingDot from "./LiveTrainingDot.tsx";
import { trainerGameNames } from "./trainerConsts.ts";
import type { TrainingJobDetail } from "../../util/types.ts";

interface LiveNowCardProps {
  /** The most recently updated active (running or queued) run. */
  job: TrainingJobDetail;
  /** How many OTHER runs are currently running/queued beyond this one. */
  moreActive: number;
  /** Opens the Runs section so the glance never under-reports state. */
  onShowAll: () => void;
}

/**
 * Tier-0 centerpiece while something is happening: ONE card for the most
 * recent active run, plus an explicit "+N more" door so multiple concurrent
 * runs are never hidden by the single-card glance.
 */
export default function LiveNowCard({ job, moreActive, onShowAll }: LiveNowCardProps): JSX.Element {
  const fraction =
    job.targetEpisodes > 0 ? Math.min(1, job.progressEpisodes / job.targetEpisodes) : 0;

  return (
    <div className="ga-live-now" data-testid="live-now-card">
      <Link to={`/trainer/jobs/${job.id}`} className="ga-live-now__main">
        {job.status === "running" ? (
          <LiveTrainingDot active label="Training live" />
        ) : (
          <span className="ga-live-now__waiting" data-testid="live-now-waiting">
            Waiting for your trainer to connect
          </span>
        )}
        <span className="ga-live-now__name">{job.modelDisplayName}</span>
        <span className="ga-live-now__game">{trainerGameNames[job.gameKey]}</span>
        {job.status === "running" && (
          <>
            <span className="ga-live-now__track" aria-hidden="true">
              <span
                className="ga-live-now__fill"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </span>
            <span className="ga-live-now__numbers" data-testid="live-now-progress">
              {job.progressEpisodes.toLocaleString()} / {job.targetEpisodes.toLocaleString()} · win
              rate {(job.currentWinRate * 100).toFixed(0)}%
            </span>
          </>
        )}
      </Link>
      {moreActive > 0 && (
        <button
          type="button"
          className="ga-live-now__more"
          onClick={onShowAll}
          data-testid="live-now-more"
        >
          +{moreActive} more active
        </button>
      )}
    </div>
  );
}
