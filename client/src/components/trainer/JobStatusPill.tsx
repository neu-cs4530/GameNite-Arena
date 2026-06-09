import type { JSX } from "react";
import Badge from "../ui/Badge.tsx";
import type { JobStatus } from "../../util/types.ts";
import { jobStatusLabel, jobStatusVariant } from "./trainerConsts.ts";

interface JobStatusPillProps {
  status: JobStatus;
  testId?: string;
}

/** Pill that visually encodes a training job's status via `<Badge>`. */
export default function JobStatusPill({
  status,
  testId = "job-status-pill",
}: JobStatusPillProps): JSX.Element {
  return (
    <Badge variant={jobStatusVariant[status]} testId={testId} title={jobStatusLabel[status]}>
      {jobStatusLabel[status]}
    </Badge>
  );
}
