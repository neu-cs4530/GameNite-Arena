import "./Card.css";
import type { JSX, ReactNode, MouseEvent } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** When provided, the card becomes a button-like interactive surface. */
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  /** Tighter padding variant — useful inside lists. */
  density?: "default" | "compact";
  interactive?: boolean;
  testId?: string;
  /** Optional accessible label, primarily for interactive cards. */
  ariaLabel?: string;
}

/**
 * Elevated surface with consistent padding, border, radius, shadow.
 * Used everywhere we need a "panel" wrapper.
 */
export default function Card({
  children,
  className = "",
  onClick,
  density = "default",
  interactive,
  testId,
  ariaLabel,
}: CardProps): JSX.Element {
  const isInteractive = Boolean(onClick) || interactive;
  return (
    <div
      className={`ga-card ga-card--${density} ${isInteractive ? "ga-card--interactive" : ""} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={testId}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }}
    >
      {children}
    </div>
  );
}
