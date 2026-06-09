import "./FilterBar.css";
import { useId, useState, type JSX, type ReactNode } from "react";
import Button from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";

interface FilterBarProps {
  children: ReactNode;
  onClear: () => void;
  /** Optional preset slot rendered above the controls (Filter presets bar). */
  presets?: ReactNode;
  /** Always-visible summary row shown to the left of the Filters toggle. */
  compactSummary?: ReactNode;
  /** Number of currently-active filters; shown as a badge on the toggle. */
  activeCount?: number;
  /** Whether the panel can be collapsed. Defaults to true. */
  collapsible?: boolean;
  /** Initial open state when collapsible. Defaults to false (closed). */
  defaultOpen?: boolean;
  /** Override open state. If provided, FilterBar becomes a controlled component. */
  open?: boolean;
  /** Called when the toggle is clicked (controlled mode). */
  onToggle?: (next: boolean) => void;
  testId?: string;
}

/**
 * Collapsible filter shell. The compact row stays always visible (sort,
 * active-filter chips supplied by the consumer, the toggle, Clear all);
 * the heavy controls panel collapses behind the toggle. All `*FilterBar`
 * compositions in this app go through here.
 */
export default function FilterBar({
  children,
  onClear,
  presets,
  compactSummary,
  activeCount = 0,
  collapsible = true,
  defaultOpen = false,
  open,
  onToggle,
  testId = "filter-bar",
}: FilterBarProps): JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = collapsible ? (isControlled ? open : uncontrolledOpen) : true;
  const panelId = useId();

  function toggle(): void {
    const next = !isOpen;
    if (onToggle) onToggle(next);
    if (!isControlled) setUncontrolledOpen(next);
  }

  const hasActive = activeCount > 0;

  return (
    <section
      className={`ga-filter-bar ${isOpen ? "ga-filter-bar--open" : "ga-filter-bar--closed"}`.trim()}
      data-testid={testId}
      aria-label="Filters"
    >
      <header className="ga-filter-bar__header">
        <div className="ga-filter-bar__compact" data-testid="filter-bar-compact">
          {compactSummary}
        </div>

        <div className="ga-filter-bar__actions">
          {collapsible && (
            <Button
              variant={isOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={toggle}
              aria-expanded={isOpen}
              aria-controls={panelId}
              data-testid="filter-toggle"
            >
              <span aria-hidden="true" className="ga-filter-bar__icon">
                ⌃
              </span>
              <span>Filters</span>
              {hasActive ? (
                <span className="ga-filter-bar__badge" data-testid="filter-active-count">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          )}
          {hasActive ? (
            <Button variant="ghost" size="sm" onClick={onClear} data-testid="filter-clear-all">
              Clear all
            </Button>
          ) : null}
        </div>
      </header>

      {isOpen ? (
        <div
          id={panelId}
          className="ga-filter-bar__panel"
          data-testid="filter-bar-panel"
          role="region"
          aria-label="Filter controls"
        >
          {presets ? <div className="ga-filter-bar__presets">{presets}</div> : null}
          <div className="ga-filter-bar__controls">{children}</div>
          <div className="ga-filter-bar__footer">
            <span className="ga-filter-bar__footer-hint">
              {hasActive
                ? `${activeCount} filter${activeCount === 1 ? "" : "s"} applied`
                : "No filters applied"}
            </span>
            {collapsible ? (
              <IconButton
                aria-label="Close filters"
                icon="×"
                size="sm"
                variant="ghost"
                onClick={toggle}
                data-testid="filter-close"
              />
            ) : null}
            <Button variant="primary" size="sm" onClick={collapsible ? toggle : onClear}>
              {collapsible ? "Done" : "Clear all"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
