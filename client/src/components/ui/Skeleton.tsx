import "./Skeleton.css";
import type { CSSProperties, JSX } from "react";

interface SkeletonProps {
  variant?: "rect" | "circle" | "text";
  width?: string | number;
  height?: string | number;
  className?: string;
  testId?: string;
}

/**
 * Shimmering placeholder used while async data is loading. Must be rendered
 * with `data-testid="skeleton"` for the test suite to assert visibility.
 *
 * Width / height are sized with raw CSS values rather than tokens because
 * skeletons are dimensionally tied to the content they're standing in for,
 * not the spacing scale.
 */
export default function Skeleton({
  variant = "rect",
  width,
  height,
  className = "",
  testId = "skeleton",
}: SkeletonProps): JSX.Element {
  const style: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };
  return (
    <span
      className={`ga-skeleton ga-skeleton--${variant} ${className}`.trim()}
      style={style}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Convenience wrapper that renders N rows of text skeletons. */
export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps): JSX.Element {
  return (
    <span className={`ga-skeleton-text ${className}`.trim()} data-testid="skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" data-testid="skeleton-line" />
      ))}
    </span>
  );
}
