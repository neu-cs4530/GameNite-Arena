import "./CompareRunsPanel.css";
import type { JSX } from "react";
import JobProgressChart from "./JobProgressChart.tsx";
import type { TrainingJobDetail } from "../../util/types.ts";

interface CompareRunsPanelProps {
  jobs: TrainingJobDetail[];
}

/** Side-by-side mini-charts + final metrics for selected runs. */
export default function CompareRunsPanel({ jobs }: CompareRunsPanelProps): JSX.Element | null {
  if (jobs.length === 0) return null;
  return (
    <div className="ga-compare" data-testid="compare-runs-panel">
      {jobs.map((j) => (
        <div key={j.id} className="ga-compare__col" data-testid={`compare-col-${j.id}`}>
          <span className="ga-compare__col-title">{j.modelDisplayName}</span>
          <span className="ga-compare__col-value">{(j.currentWinRate * 100).toFixed(0)}%</span>
          <JobProgressChart
            variant="mini"
            episodes={j.episodesSeries}
            meanReward={j.meanRewardSeries}
            winRate={j.winRateSeries}
          />
        </div>
      ))}
    </div>
  );
}
