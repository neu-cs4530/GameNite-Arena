import "./Pagination.css";
import type { JSX } from "react";
import Button from "./Button.tsx";

interface PaginationProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
  /** Total number of buttons (excluding next/prev) to render. */
  maxButtons?: number;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Numbered pagination with prev / next and ellipses. */
export default function Pagination({
  current,
  total,
  onChange,
  maxButtons = 5,
}: PaginationProps): JSX.Element | null {
  if (total <= 1) return null;
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(total, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  const pages = range(start, end);

  return (
    <nav className="ga-pagination" aria-label="Pagination" data-testid="pagination">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(current - 1)}
        disabled={current <= 1}
        aria-label="Previous page"
      >
        ‹ Prev
      </Button>
      {start > 1 && (
        <>
          <button
            type="button"
            className="ga-pagination__page"
            onClick={() => onChange(1)}
            aria-label="Page 1"
          >
            1
          </button>
          {start > 2 && <span className="ga-pagination__ellipsis">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={`ga-pagination__page ${p === current ? "ga-pagination__page--current" : ""}`}
          onClick={() => onChange(p)}
          aria-label={`Page ${p}`}
          aria-current={p === current ? "page" : undefined}
        >
          {p}
        </button>
      ))}
      {end < total && (
        <>
          {end < total - 1 && <span className="ga-pagination__ellipsis">…</span>}
          <button
            type="button"
            className="ga-pagination__page"
            onClick={() => onChange(total)}
            aria-label={`Page ${total}`}
          >
            {total}
          </button>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(current + 1)}
        disabled={current >= total}
        aria-label="Next page"
      >
        Next ›
      </Button>
    </nav>
  );
}
