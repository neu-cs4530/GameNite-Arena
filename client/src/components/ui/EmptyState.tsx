import "./EmptyState.css";
import type { JSX, ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}

/** Friendly empty state, e.g. "No replays match these filters". */
export default function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
  testId = "empty-state",
}: EmptyStateProps): JSX.Element {
  return (
    <div className={`ga-empty ${className}`.trim()} data-testid={testId} role="status">
      {icon && (
        <div className="ga-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="ga-empty__title">{title}</div>
      {body && <div className="ga-empty__body">{body}</div>}
      {action && <div className="ga-empty__action">{action}</div>}
    </div>
  );
}
