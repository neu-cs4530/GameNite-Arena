import "./NewTrainingRun.css";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Section from "../components/ui/Section.tsx";
import { HyperparamForm } from "../components/trainer/index.ts";
import { hyperparamPresets, trainerGameNames } from "../components/trainer/trainerConsts.ts";
import { MultiToggle } from "../components/filters/index.ts";
import useAuth from "../hooks/useAuth.ts";
import { getJob, submitJob } from "../services/trainingService.ts";
import {
  ALL_GAME_KEYS,
  type HyperparamPreset,
  type TrainerGameKey,
  type TrainingHyperparameters,
} from "../util/types.ts";

const defaultHp: TrainingHyperparameters = { episodes: 100_000, learningRate: 3e-4 };

const GAME_OPTIONS = ALL_GAME_KEYS.map((g) => ({ value: g, label: trainerGameNames[g] }));

/**
 * Registering a run, not launching one: training happens on the user's
 * machine. This form captures what the platform needs to track the run
 * (game, name, config), registers the session, and hands off to the live
 * page — whose queued state shows the exact command to connect a trainer.
 */
export default function NewTrainingRun(): JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const fromJob = searchParams.get("fromJob");
  const presetParam = searchParams.get("preset");

  const [game, setGame] = useState<TrainerGameKey>("nim");
  const [name, setName] = useState("");
  const [hp, setHp] = useState<TrainingHyperparameters>(() => {
    if (presetParam && presetParam in hyperparamPresets) {
      return { ...hyperparamPresets[presetParam as HyperparamPreset] };
    }
    return { ...defaultHp };
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  // Bumped when an async prefill lands: HyperparamForm's inputs keep local
  // state, so a remount is what makes the prefilled values visible.
  const [prefillVersion, setPrefillVersion] = useState(0);

  /* "Run again": prefill from the real source run. */
  useEffect(() => {
    if (!fromJob) return;
    let cancelled = false;
    getJob(fromJob)
      .then((source) => {
        if (cancelled) return;
        setGame(source.gameKey);
        setName(source.modelDisplayName);
        setHp({ ...source.hyperparameters });
        setPrefillVersion((v) => v + 1);
      })
      .catch(() => {
        // Source run gone — the form simply starts blank.
      });
    return () => {
      cancelled = true;
    };
  }, [fromJob]);

  const episodesError =
    hp.episodes < 1
      ? "Episode count must be at least 1."
      : hp.episodes > 10_000_000
        ? "Episode count cannot exceed 10,000,000."
        : !Number.isInteger(hp.episodes)
          ? "Episode count must be a whole number."
          : null;
  const learningRateError =
    !Number.isFinite(hp.learningRate) || hp.learningRate <= 0 || hp.learningRate > 1
      ? "Learning rate must be greater than 0 and at most 1."
      : null;

  const canSubmit =
    !submitting && name.trim().length > 0 && episodesError === null && learningRateError === null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { jobId } = await submitJob(
        {
          gameKey: game,
          modelDisplayName: name.trim(),
          hyperparameters: hp,
        },
        auth,
      );
      void navigate(`/trainer/jobs/${jobId}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ga-new-run" onSubmit={onSubmit} noValidate data-testid="new-training-run">
      <header className="ga-new-run__hero">
        <h1>New training run</h1>
        <p>Register the run here; train it on your machine.</p>
      </header>

      <Section title="Game" subtitle="Which arena is this model for?">
        <MultiToggle
          label="Game"
          options={GAME_OPTIONS}
          value={[game]}
          singleSelect
          onChange={(next) => {
            const choice = next[next.length - 1] as TrainerGameKey | undefined;
            if (choice) setGame(choice);
          }}
        />
      </Section>

      <Section title="Model name" subtitle="How it appears on the dashboard and leaderboards.">
        <input
          className="ga-new-run__name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${game}-bot`}
          aria-label="Model name"
          data-testid="model-name-input"
        />
      </Section>

      <Section
        title="Training settings"
        subtitle="Recorded with the session and shown to your trainer; your loop decides how to use them."
      >
        <HyperparamForm key={prefillVersion} value={hp} onChange={setHp} />
        {episodesError && <p className="ga-new-run__error">{episodesError}</p>}
        {learningRateError && <p className="ga-new-run__error">{learningRateError}</p>}
      </Section>

      <Card testId="local-first-note">
        <div className="ga-new-run__note">
          <strong>Training happens on your machine.</strong> Registering creates a queued session;
          the next page shows the exact command to connect your trainer — or grab the{" "}
          <a href="/api/training/kit/install.sh" target="_blank" rel="noreferrer">
            training kit
          </a>{" "}
          first.
        </div>
      </Card>

      {submitError && <ErrorState title="Could not register the run" body={submitError.message} />}

      <footer className="ga-new-run__actions">
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={!canSubmit}
          data-testid="register-run"
        >
          Register training run
        </Button>
      </footer>
    </form>
  );
}
