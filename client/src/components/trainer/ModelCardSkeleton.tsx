import "./ModelCard.css";
import type { JSX } from "react";
import Card from "../ui/Card.tsx";
import Skeleton from "../ui/Skeleton.tsx";

export default function ModelCardSkeleton(): JSX.Element {
  return (
    <Card className="ga-model-card" density="default" testId="model-card-skeleton">
      <div className="ga-model-card__top">
        <div className="ga-model-card__game">
          <Skeleton variant="rect" width={32} height={32} />
          <Skeleton variant="rect" width={70} height={20} />
        </div>
        <Skeleton variant="rect" width={50} height={18} />
      </div>
      <Skeleton variant="rect" width={180} height={20} />
      <div className="ga-model-card__owner">
        <Skeleton variant="circle" width={24} height={24} />
        <Skeleton variant="rect" width={100} height={14} />
      </div>
      <div className="ga-model-card__meta">
        <Skeleton variant="rect" width={60} height={14} />
        <Skeleton variant="rect" width={50} height={14} />
        <Skeleton variant="rect" width={70} height={14} />
      </div>
      <div className="ga-model-card__footer">
        <Skeleton variant="rect" width={70} height={28} />
        <Skeleton variant="rect" width={60} height={28} />
      </div>
    </Card>
  );
}
