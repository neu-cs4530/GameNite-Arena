import "./TrainingJobCard.css";
import type { JSX } from "react";
import Card from "../ui/Card.tsx";
import Skeleton from "../ui/Skeleton.tsx";

/** Skeleton companion for `<TrainingJobCard>`. */
export default function TrainingJobCardSkeleton(): JSX.Element {
  return (
    <Card className="ga-job-card" density="default" testId="training-job-card-skeleton">
      <div className="ga-job-card__top">
        <div className="ga-job-card__title-row">
          <Skeleton variant="rect" width={28} height={28} />
          <Skeleton variant="rect" width={140} height={20} />
          <Skeleton variant="rect" width={70} height={18} />
        </div>
        <Skeleton variant="rect" width={70} height={20} />
      </div>
      <div className="ga-job-card__meta">
        <Skeleton variant="rect" width={120} height={14} />
        <Skeleton variant="rect" width={100} height={14} />
        <Skeleton variant="rect" width={80} height={14} />
      </div>
      <Skeleton variant="rect" width="100%" height={8} />
      <Skeleton variant="rect" width="100%" height={48} />
      <div className="ga-job-card__actions">
        <Skeleton variant="rect" width={90} height={28} />
        <Skeleton variant="rect" width={70} height={28} />
      </div>
    </Card>
  );
}
