import "./Badge.css";
import type { JSX, ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "human"
  | "ai"
  | "tier-bronze"
  | "tier-silver"
  | "tier-gold"
  | "tier-platinum"
  | "tier-diamond"
  | "win"
  | "loss"
  | "draw"
  | "live"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "marker-good"
  | "marker-interesting"
  | "marker-questionable"
  | "marker-bad"
  | "marker-winning";

interface BadgeProps {
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
  testId?: string;
}

/**
 * Compact colored chip. All colors come from CSS tokens; the variant prop
 * just picks the right CSS class.
 */
export default function Badge({
  variant = "default",
  icon,
  children,
  className = "",
  title,
  testId,
}: BadgeProps): JSX.Element {
  return (
    <span
      className={`ga-badge ga-badge--${variant} ${className}`.trim()}
      title={title}
      data-testid={testId}
    >
      {icon && <span className="ga-badge__icon">{icon}</span>}
      <span className="ga-badge__label">{children}</span>
    </span>
  );
}
