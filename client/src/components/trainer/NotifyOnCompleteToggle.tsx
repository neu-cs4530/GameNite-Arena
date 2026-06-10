import { useEffect, useState, type JSX } from "react";
import Toggle from "../filters/Toggle.tsx";
import { notifyOnCompleteKey } from "./trainerConsts.ts";

interface NotifyOnCompleteToggleProps {
  jobId: string;
}

/** Persists user's notify-on-complete pref to localStorage. */
export default function NotifyOnCompleteToggle({
  jobId,
}: NotifyOnCompleteToggleProps): JSX.Element {
  const key = notifyOnCompleteKey(jobId);
  const [checked, setChecked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(key) === "true";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (checked) window.localStorage.setItem(key, "true");
    else window.localStorage.removeItem(key);
  }, [checked, key]);
  return (
    <Toggle
      label="Notify me when this training completes"
      checked={checked}
      onChange={setChecked}
      testId="notify-on-complete"
    />
  );
}
