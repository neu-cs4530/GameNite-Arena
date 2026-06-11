import "./MatchCard.css";
import Card from "../ui/Card.tsx";
import Skeleton from "../ui/Skeleton.tsx";
import type { JSX } from "react";

/** Skeleton companion that mirrors `<MatchCard>`'s footprint. */
export default function MatchCardSkeleton(): JSX.Element {
  return (
    <Card
      className="ga-match-card"
      density="compact"
      testId="match-card-skeleton"
      ariaLabel="Loading replay"
    >
      <div className="ga-match-card__top">
        <div className="ga-match-card__game">
          <Skeleton variant="rect" width={32} height={32} />
          <Skeleton variant="rect" width={70} height={20} />
        </div>
        <Skeleton variant="circle" width={28} height={28} />
      </div>
      <div className="ga-match-card__title-row">
        <div className="ga-match-card__participants">
          <Skeleton variant="circle" width={32} height={32} />
          <Skeleton variant="rect" width={200} height={20} />
          <Skeleton variant="circle" width={32} height={32} />
        </div>
      </div>
      <div className="ga-match-card__meta">
        <Skeleton variant="rect" width={60} height={16} />
        <Skeleton variant="rect" width={50} height={16} />
        <Skeleton variant="rect" width={50} height={16} />
      </div>
      <div className="ga-match-card__footer">
        <Skeleton variant="rect" width={80} height={20} />
        <Skeleton variant="rect" width={50} height={20} />
        <Skeleton variant="rect" width={60} height={16} />
      </div>
    </Card>
  );
}
