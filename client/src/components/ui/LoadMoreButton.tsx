import "./LoadMoreButton.css";
import type { JSX } from "react";
import Button from "./Button.tsx";

interface LoadMoreButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  remaining?: number;
}

export default function LoadMoreButton({
  onClick,
  loading,
  disabled,
  remaining,
}: LoadMoreButtonProps): JSX.Element {
  return (
    <div className="ga-load-more">
      <Button variant="secondary" size="md" onClick={onClick} loading={loading} disabled={disabled}>
        Load more{remaining ? ` (${remaining})` : ""}
      </Button>
    </div>
  );
}
