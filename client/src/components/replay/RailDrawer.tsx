import "./RailDrawer.css";
import { useId, useState, type JSX, type ReactNode } from "react";

interface RailDrawerProps {
  title: string;
  /** Small count chip rendered after the title (e.g. move / note totals). */
  badge?: ReactNode;
  /**
   * Always-visible slot on the header row, OUTSIDE the toggle button — for
   * actions that must stay reachable while the drawer is collapsed (e.g.
   * "Analyze with engine").
   */
  headerExtra?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state; leave undefined for uncontrolled. */
  open?: boolean;
  onToggle?: (next: boolean) => void;
  children: ReactNode;
  testId?: string;
}

/**
 * Collapsible section for the replay viewer's side rail. One consistent
 * container ("drawer") for every kind of secondary information keeps the
 * rail calm: a labelled toggle row, an optional always-visible action, and
 * a body that folds away when the viewer wants to focus on the board.
 */
export default function RailDrawer({
  title,
  badge,
  headerExtra,
  defaultOpen = false,
  open,
  onToggle,
  children,
  testId,
}: RailDrawerProps): JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const bodyId = useId();

  function toggle(): void {
    const next = !isOpen;
    if (onToggle) onToggle(next);
    if (!isControlled) setUncontrolledOpen(next);
  }

  return (
    <section
      className={`ga-rail-drawer ${isOpen ? "ga-rail-drawer--open" : ""}`.trim()}
      data-testid={testId}
    >
      <div className="ga-rail-drawer__row">
        <button
          type="button"
          className="ga-rail-drawer__toggle"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
        >
          <span className="ga-rail-drawer__chevron" aria-hidden="true">
            ▾
          </span>
          <span className="ga-rail-drawer__title">{title}</span>
          {badge !== undefined && <span className="ga-rail-drawer__badge">{badge}</span>}
        </button>
        {headerExtra && <div className="ga-rail-drawer__extra">{headerExtra}</div>}
      </div>
      {isOpen && (
        <div className="ga-rail-drawer__body" id={bodyId} role="region" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  );
}
