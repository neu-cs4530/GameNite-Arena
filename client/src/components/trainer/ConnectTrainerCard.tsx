import "./ConnectTrainerCard.css";
import type { JSX } from "react";
import Card from "../ui/Card.tsx";
import CopyField from "../ui/CopyField.tsx";
import type { ReplayGameKey } from "../../util/types.ts";

interface ConnectTrainerCardProps {
  jobId: string;
  username: string;
  /** The run's game — decides which kit script the card hands the user. */
  gameKey: ReplayGameKey;
  /** Registered episode target, so the demo simulates the run as configured. */
  targetEpisodes: number;
}

/**
 * The queued state of the live page: the session is registered and this
 * page is already subscribed — the moment a trainer attaches with this
 * job id and reports, everything below comes alive. Training happens on
 * the user's machine; this card is the handoff.
 */
export default function ConnectTrainerCard({
  jobId,
  username,
  gameKey,
}: ConnectTrainerCardProps): JSX.Element {
  // Nim has a real end-to-end SB3 trainer in the kit; other games only have
  // the synthetic demo harness until their adapter examples grow a loop, and
  // the card must never pass fake metrics off as a real run.
  const command =
    gameKey === "nim"
      ? `python3 example_local_training_nim.py --username ${username} ` +
        `--password <your password> --job-id ${jobId}`
      : `python3 demo_local_session.py --game ${gameKey} --username ${username} ` +
        `--password <your password> --job-id ${jobId}`;

  return (
    <Card testId="connect-trainer-card">
      <div className="ga-connect-trainer">
        <h2>Connect your trainer</h2>
        <p>
          This run is registered and waiting. Training happens on <strong>your machine</strong> —
          from your training-kit folder, attach to this session:
          {gameKey !== "nim" &&
            " (no real trainer ships for this game yet — the command below streams synthetic demo metrics; wire your own loop with the adapter SDK for the real thing)"}
        </p>
        <CopyField value={command} testId="connect-trainer-command" />
        <p className="ga-connect-trainer__hint">
          No kit yet? Fetch it with{" "}
          <code>curl -fsSL {window.location.origin}/api/training/kit/install.sh | sh</code> — or
          wire your own loop with <code>session_reporter.attach(&quot;{jobId}&quot;)</code>. This
          page is live: it updates the moment your trainer reports.
        </p>
      </div>
    </Card>
  );
}
