import "./DeploymentCard.css";
import type { JSX } from "react";
import Card from "../ui/Card.tsx";
import Skeleton from "../ui/Skeleton.tsx";

export default function DeploymentCardSkeleton(): JSX.Element {
  return (
    <Card className="ga-deployment-card" density="default" testId="deployment-card-skeleton">
      <div className="ga-deployment-card__top">
        <div className="ga-deployment-card__title-row">
          <Skeleton variant="rect" width={20} height={20} />
          <Skeleton variant="rect" width={160} height={20} />
          <Skeleton variant="rect" width={70} height={18} />
        </div>
        <Skeleton variant="rect" width={60} height={20} />
      </div>
      <div className="ga-deployment-card__meta">
        <Skeleton variant="rect" width={120} height={14} />
        <Skeleton variant="rect" width={80} height={14} />
        <Skeleton variant="rect" width={100} height={14} />
      </div>
      <Skeleton variant="rect" width="100%" height={32} />
      <div className="ga-deployment-card__actions">
        <Skeleton variant="rect" width={70} height={28} />
        <Skeleton variant="rect" width={70} height={28} />
      </div>
    </Card>
  );
}
