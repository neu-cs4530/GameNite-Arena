import "./Disclosure.css";
import type { JSX, ReactNode } from "react";

export type DisclosureLevel = "section" | "row" | "inline";

interface DisclosureProps {
  /** Header content (left side) — always visible, this is the door. */
  summary: ReactNode;
  /** Right-side header content: counts, badges, quick actions. */
  meta?: ReactNode;
  /** Controlled open state — pages own it (chips and deep links drive it). */
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  /**
   * Visual weight: "section" for top-level dashboard groups, "row" for
   * per-record expanders, "inline" for nested advanced panels.
   */
  level?: DisclosureLevel;
  /** Anchor id so deep links (#fragment / ?tab=) can target and scroll. */
  id?: string;
  testId?: string;
  className?: string;
}

/**
 * The progressive-disclosure primitive: a header that is always visible and
 * a body that only exists in the DOM while open. Closed means GONE — not
 * hidden with CSS — so collapsed tiers cost nothing and screen readers
 * never wade through them.
 */
export default function Disclosure({
  summary,
  meta,
  open,
  onToggle,
  children,
  level = "section",
  id,
  testId,
  className,
}: DisclosureProps): JSX.Element {
  const classes = ["ga-disclosure", `ga-disclosure--${level}`, open ? "ga-disclosure--open" : ""]
    .filter(Boolean)
    .concat(className ? [className] : [])
    .join(" ");

  return (
    <div className={classes} id={id} data-testid={testId}>
      <div className="ga-disclosure__header">
        <button
          type="button"
          className="ga-disclosure__toggle"
          aria-expanded={open}
          onClick={() => onToggle(!open)}
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          <span className="ga-disclosure__chevron" aria-hidden="true">
            ▸
          </span>
          <span className="ga-disclosure__summary">{summary}</span>
        </button>
        {meta && <div className="ga-disclosure__meta">{meta}</div>}
      </div>
      {open && (
        <div className="ga-disclosure__body" data-testid={testId ? `${testId}-body` : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
