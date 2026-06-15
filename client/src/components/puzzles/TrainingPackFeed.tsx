import "./TrainingPackFeed.css";
import type { JSX } from "react";
import type { GameKey } from "@gamenite/shared";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import ErrorState from "../ui/ErrorState.tsx";
import Skeleton, { SkeletonText } from "../ui/Skeleton.tsx";
import TrainingPuzzleCard from "./TrainingPuzzleCard.tsx";
import useTrainingPack from "../../hooks/useTrainingPack.ts";

/** One game's practice feed: a few mined positions plus a "load more" button. */
export default function TrainingPackFeed({ gameKey }: { gameKey: GameKey }): JSX.Element {
  const { status, items, loadMore, loadingMore } = useTrainingPack(gameKey);

  if (status === "pending") {
    return (
      <Card testId="training-feed-loading">
        <Skeleton height={160} className="ga-puzzle-card__board-skeleton" />
        <SkeletonText lines={2} />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <ErrorState testId="training-feed-error" title="Couldn't load practice puzzles" />
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          testId="training-feed-empty"
          icon="◌"
          title="No practice puzzles yet"
          body="Practice puzzles are mined from real finished matches. Play more matches and they'll show up here."
        />
      </Card>
    );
  }

  return (
    <div className="ga-training-feed" data-testid="training-feed">
      {items.map((item) => (
        <TrainingPuzzleCard key={item.sourceMatchId} item={item} />
      ))}
      <div className="ga-training-feed__load-more">
        <Button
          variant="secondary"
          onClick={loadMore}
          loading={loadingMore}
          data-testid="training-load-more"
        >
          Load more
        </Button>
      </div>
    </div>
  );
}
