import "./ConnectTrainerCard.css";
import { useEffect, useState, type JSX } from "react";
import Card from "../ui/Card.tsx";
import CopyField from "../ui/CopyField.tsx";
import Skeleton from "../ui/Skeleton.tsx";
import useAuth from "../../hooks/useAuth.ts";
import useLoginContext from "../../hooks/useLoginContext.ts";
import { mintTrainingToken } from "../../services/trainingService.ts";
import {
  buildBootstrapCommand,
  buildKitRunCommand,
  buildTokenMintCommand,
} from "../../util/trainerCommand.ts";

interface ConnectTrainerCardProps {
  jobId: string;
}

type TokenState = { phase: "minting" } | { phase: "ready"; token: string } | { phase: "failed" };

/**
 * The queued state of the live page: the session is registered and this
 * page is already subscribed — the moment a trainer attaches with this
 * job id and reports, everything below comes alive. Training happens on
 * the user's machine; this card is the handoff.
 *
 * It mints a real training token on mount so the copyable bootstrap
 * command works as-is. If minting fails, the card degrades to an honest
 * manual two-step (mint the token yourself, then run the installer) —
 * never a command that pretends to work.
 */
export default function ConnectTrainerCard({ jobId }: ConnectTrainerCardProps): JSX.Element {
  const auth = useAuth();
  const { user } = useLoginContext();
  const [tokenState, setTokenState] = useState<TokenState>({ phase: "minting" });

  useEffect(() => {
    let cancelled = false;
    // The initial state is already "minting"; on auth/job changes the
    // re-mint below simply overwrites whatever is showing when it lands
    // (no synchronous set-state in the effect body — house lint rule).
    mintTrainingToken(auth)
      .then(({ token }) => {
        if (!cancelled) setTokenState({ phase: "ready", token });
      })
      .catch(() => {
        if (!cancelled) setTokenState({ phase: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [auth, jobId]);

  const origin = window.location.origin;

  return (
    <Card testId="connect-trainer-card">
      <div className="ga-connect-trainer">
        <h2>Connect your trainer</h2>
        <p>
          This run is registered and waiting. Training happens on <strong>your machine</strong> —
          one paste in a terminal sets up the kit and attaches it to this session:
        </p>

        {tokenState.phase === "minting" && (
          <div className="ga-connect-trainer__minting" data-testid="connect-trainer-minting">
            <Skeleton height="2.25rem" />
            <span className="ga-connect-trainer__hint">Minting your training token…</span>
          </div>
        )}

        {tokenState.phase === "ready" && (
          <>
            <CopyField
              value={buildBootstrapCommand(origin, jobId, tokenState.token)}
              masked
              copyLabel="Copy command"
              testId="connect-trainer-command"
            />
            <CopyField
              label="Already have the kit?"
              value={buildKitRunCommand(jobId, tokenState.token)}
              masked
              copyLabel="Copy attach command"
              testId="connect-trainer-kit-line"
            />
          </>
        )}

        {tokenState.phase === "failed" && (
          <div className="ga-connect-trainer__fallback" data-testid="connect-trainer-fallback">
            <p>
              We could not mint a training token for you right now, so the one-paste setup is
              unavailable. The manual two-step works the same way:
            </p>
            <CopyField
              label="1. Mint a token (replace YOUR_PASSWORD)"
              value={buildTokenMintCommand(origin, user.username)}
              masked
              copyLabel="Copy command"
              testId="connect-trainer-mint-fallback"
            />
            <CopyField
              label="2. Install + attach with it"
              value={buildBootstrapCommand(origin, jobId, "PASTE_TOKEN_HERE")}
              masked
              copyLabel="Copy command"
              testId="connect-trainer-command"
            />
          </div>
        )}

        <p className="ga-connect-trainer__hint">
          This page is live: it updates the moment your trainer reports.
        </p>
      </div>
    </Card>
  );
}
