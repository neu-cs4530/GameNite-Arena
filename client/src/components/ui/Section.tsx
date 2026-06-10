import "./Section.css";
import type { JSX, ReactNode } from "react";

interface SectionProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Render as a semantic <section> with aria-label. */
  ariaLabel?: string;
}

export default function Section({
  title,
  subtitle,
  actions,
  children,
  className = "",
  testId,
  ariaLabel,
}: SectionProps): JSX.Element {
  return (
    <section
      className={`ga-section ${className}`.trim()}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {(title || actions || subtitle) && (
        <header className="ga-section__header">
          <div className="ga-section__titles">
            {title && <h2 className="ga-section__title">{title}</h2>}
            {subtitle && <p className="ga-section__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ga-section__actions">{actions}</div>}
        </header>
      )}
      <div className="ga-section__body">{children}</div>
    </section>
  );
}
