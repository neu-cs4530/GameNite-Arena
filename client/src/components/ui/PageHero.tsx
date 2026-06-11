import "./PageHero.css";
import type { JSX, ReactNode } from "react";

interface PageHeroProps {
  title: string;
  /** One-sentence framing under the title. */
  lede?: ReactNode;
  /** Small uppercase line between title and lede (e.g. the puzzle day). */
  kicker?: ReactNode;
  testId?: string;
}

/**
 * The gradient page banner every top-level tab opens with, so the tabs read
 * as one product. Title + optional kicker/lede; nothing interactive.
 */
export default function PageHero({ title, lede, kicker, testId }: PageHeroProps): JSX.Element {
  return (
    <header className="ga-page-hero" data-testid={testId}>
      <h1 className="ga-page-hero__title">{title}</h1>
      {kicker && <p className="ga-page-hero__kicker">{kicker}</p>}
      {lede && <p className="ga-page-hero__lede">{lede}</p>}
    </header>
  );
}
