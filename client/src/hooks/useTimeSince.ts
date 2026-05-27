import { useCallback, useContext } from "react";
import { TimeContext } from "../contexts/TimeContext.tsx";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import dayjs from "dayjs";

// DayJS needs to be configured somewhere, here's fine
dayjs.extend(updateLocale);
dayjs.extend(relativeTime);
dayjs.updateLocale("en", {
  relativeTime: { ...dayjs.Ls["en"].relativeTime, s: "seconds" },
});

/**
 * The hook returns a function for formatting dates (in the past, e.g.
 * 15 minutes ago or 52 minutes ago) and returning a dayjs-formatted
 * date, e.g. "15 minutes ago" or "an hour ago".
 *
 * The time is relative to the `TimeContext`, so inside the context of
 * `UpdatingTimeContext`, the time will periodically update.
 */
export default function useTimeSince() {
  const now = useContext(TimeContext);

  return useCallback(
    (date: string | Date) => {
      const timeMs = typeof date === "string" ? new Date(date).getTime() : date.getTime();
      if (now === null) {
        return dayjs(date).fromNow();
      }

      // Don't allow dates to be in the future;
      if (now.getTime() < timeMs) {
        return "just now";
      }

      return dayjs(date).from(now);
    },
    [now],
  );
}
