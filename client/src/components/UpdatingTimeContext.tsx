import { type JSX, useEffect, useRef, useState } from "react";
import { TimeContext } from "../contexts/TimeContext.tsx";

interface TimeContextKeeperProps {
  updateFrequency: number;
  children: JSX.Element;
}

/**
 * Create a TimeContext that updates the "current time" based on the updateFrequency.
 * Intended to be used with the `useTimeSince` hook.
 */
export default function TimeContextKeeper({ updateFrequency, children }: TimeContextKeeperProps) {
  const [timeBase, setTimeBase] = useState(new Date());
  const timeoutRef = useRef<undefined | ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function updateTimeBase() {
      setTimeBase(new Date());
      timeoutRef.current = setTimeout(updateTimeBase, updateFrequency);
    }

    timeoutRef.current = setTimeout(updateTimeBase, updateFrequency);
    return () => clearTimeout(timeoutRef.current);
  }, [updateFrequency]);

  return <TimeContext value={timeBase}>{children}</TimeContext>;
}
