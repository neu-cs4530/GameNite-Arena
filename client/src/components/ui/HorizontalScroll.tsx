import "./HorizontalScroll.css";
import type { JSX, ReactNode } from "react";
import { useRef } from "react";
import IconButton from "./IconButton.tsx";

interface HorizontalScrollProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  testId?: string;
}

/** Horizontal scrolling strip with chevron controls — used by featured rows. */
export default function HorizontalScroll({
  children,
  ariaLabel,
  className = "",
  testId = "horizontal-scroll",
}: HorizontalScrollProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);

  function scrollBy(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.8 * direction, behavior: "smooth" });
  }

  return (
    <div
      className={`ga-hscroll ${className}`.trim()}
      data-testid={testId}
      aria-label={ariaLabel}
      role="region"
    >
      <IconButton
        aria-label="Scroll left"
        icon="‹"
        className="ga-hscroll__nav ga-hscroll__nav--prev"
        variant="secondary"
        onClick={() => scrollBy(-1)}
      />
      <div className="ga-hscroll__track" ref={trackRef}>
        {children}
      </div>
      <IconButton
        aria-label="Scroll right"
        icon="›"
        className="ga-hscroll__nav ga-hscroll__nav--next"
        variant="secondary"
        onClick={() => scrollBy(1)}
      />
    </div>
  );
}
