import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../ui/Button.tsx";
import type { ModelSummary } from "../../util/types.ts";

interface ForkButtonProps {
  model: ModelSummary;
  /** Optional override; default navigates to /models/:id/fork. */
  onFork?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}

/** Navigates to the fork-flow page (Story 2.13). */
export default function ForkButton({
  model,
  onFork,
  variant = "secondary",
}: ForkButtonProps): JSX.Element {
  const navigate = useNavigate();
  function click() {
    if (onFork) onFork();
    else void navigate(`/models/${model.id}/fork`);
  }
  return (
    <Button variant={variant} onClick={click} data-testid="fork-button">
      Fork model
    </Button>
  );
}
