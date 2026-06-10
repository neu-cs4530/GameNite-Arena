import "./TimeAgo.css";
import { useContext, type JSX } from "react";
import { TimeContext } from "../../contexts/TimeContext.tsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface TimeAgoProps {
  /** ISO date string or Date object. */
  date: string | Date;
  className?: string;
  testId?: string;
}

/**
 * Renders a relative "2d ago" timestamp inside a `<time>` element. The
 * `title` and `dateTime` attributes carry the full ISO timestamp so a hover
 * tooltip exposes it; the e2e tests assert on these attributes.
 */
export default function TimeAgo({ date, className = "", testId }: TimeAgoProps): JSX.Element {
  const now = useContext(TimeContext);
  const dt = typeof date === "string" ? new Date(date) : date;
  const iso = dt.toISOString();
  const human = humanRelative(dt, now);
  return (
    <time
      className={`ga-time-ago ${className}`.trim()}
      data-testid={testId}
      dateTime={iso}
      title={iso}
    >
      {human}
    </time>
  );
}

function humanRelative(then: Date, now: Date | null): string {
  if (!now) return dayjs(then).fromNow();
  if (now.getTime() < then.getTime()) return "just now";
  return dayjs(then).from(now);
}
