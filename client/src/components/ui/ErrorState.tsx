import "./ErrorState.css";
import type { JSX, ReactNode } from "react";
import Button from "./Button.tsx";

interface ErrorStateProps {
  title?: ReactNode;
  body?: ReactNode;
  retry?: () => void;
  className?: string;
  testId?: string;
}

/** Friendly retry-able error state. */
export default function ErrorState({
  title = "Something went wrong",
  body = "We hit an error loading this content. Please try again.",
  retry,
  className = "",
  testId = "error-state",
}: ErrorStateProps): JSX.Element {
  return (
    <div className={`ga-error ${className}`.trim()} data-testid={testId} role="alert">
      <div className="ga-error__icon" aria-hidden="true">
        !
      </div>
      <div className="ga-error__title">{title}</div>
      {body && <div className="ga-error__body">{body}</div>}
      {retry && (
        <Button variant="secondary" onClick={retry} className="ga-error__retry">
          Try again
        </Button>
      )}
    </div>
  );
}
