import "./CostEstimator.css";
import type { JSX } from "react";
import { estimateTrainingCost } from "../../services/trainingService.ts";

interface CostEstimatorProps {
  episodes: number;
}

/** Tiny estimator panel surfaced on the new-training-run form. */
export default function CostEstimator({ episodes }: CostEstimatorProps): JSX.Element {
  const est = estimateTrainingCost(episodes);
  return (
    <div
      className={`ga-cost ${est.withinBudget ? "" : "ga-cost--over"}`.trim()}
      data-testid="cost-estimator"
      role="status"
    >
      <div className="ga-cost__title">Estimated training cost</div>
      <div className="ga-cost__row">
        <span>Estimated time</span>
        <strong data-testid="cost-estimator-minutes">{est.estimatedMinutes} min</strong>
      </div>
      <div className="ga-cost__row">
        <span>Compute credits</span>
        <strong data-testid="cost-estimator-credits">{est.totalCredits.toLocaleString()}</strong>
      </div>
      {!est.withinBudget && <span>Over the per-job credit budget — consider fewer episodes.</span>}
    </div>
  );
}
