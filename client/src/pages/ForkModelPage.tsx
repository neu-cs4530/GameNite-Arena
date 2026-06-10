import "./ForkModelPage.css";
import { useState, type FormEvent, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useAuth from "../hooks/useAuth.ts";
import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Section from "../components/ui/Section.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import { HyperparamForm } from "../components/trainer/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useModel from "../hooks/useModel.ts";
import { forkModel } from "../services/modelService.ts";
import { submitJob } from "../services/trainingService.ts";
import type { TrainingHyperparameters } from "../util/types.ts";

const defaultHp: TrainingHyperparameters = { episodes: 100_000, learningRate: 3e-4 };

export default function ForkModelPage(): JSX.Element {
  const { modelId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { model, loading, error, refetch } = useModel(modelId);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [hp, setHp] = useState<TrainingHyperparameters>(defaultHp);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);

  // Derive the default name from the source model; let the user override.
  const name = nameOverride ?? (model ? `Fork of ${model.displayName}` : "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!model) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const fork = await forkModel(model.id, {
        displayName: name.trim() || `Fork of ${model.displayName}`,
        visibility: "private",
      });
      const submitted = await submitJob(
        {
          modelId: fork.modelId,
          gameKey: model.gameKey,
          modelDisplayName: name.trim() || `Fork of ${model.displayName}`,
          hyperparameters: hp,
        },
        auth,
      );
      void navigate(`/trainer/jobs/${submitted.jobId}`);
    } catch (err: unknown) {
      const e2 = err instanceof Error ? err : new Error(String(err));
      setSubmitError(e2);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="ga-fork-page" data-testid="fork-model-page-skeleton">
        <Skeleton variant="rect" width="100%" height={120} />
        <Skeleton variant="rect" width="100%" height={220} />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="ga-fork-page">
        <ErrorState
          title="Could not load source model"
          body={error?.message ?? "Model not found."}
          retry={() => refetch()}
        />
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const episodeError =
    hp.episodes < 1
      ? "Episode count must be at least 1."
      : hp.episodes > 10_000_000
        ? "Episode count cannot exceed 10,000,000."
        : null;

  return (
    <form className="ga-fork-page" data-testid="fork-model-page" onSubmit={handleSubmit}>
      <header className="ga-fork-page__hero">
        <h1>Fork model</h1>
        <p>
          Create your own training run starting from this model's weights. Your fork is private by
          default.
        </p>
      </header>

      <Card density="default" testId="fork-source-summary">
        <div className="ga-fork-page__source">
          <div className="ga-fork-page__source-top">
            <Badge variant="default">{trainerGameNames[model.gameKey]}</Badge>
            <Badge variant={model.visibility === "public" ? "info" : "default"}>
              {model.visibility === "public" ? "Public" : "Private"}
            </Badge>
          </div>
          <h2>{model.displayName}</h2>
          <div className="ga-fork-page__source-owner">
            <Avatar name={model.owner.displayName} size="sm" variant="default" />
            <span>{model.owner.displayName}</span>
            <span className="ga-fork-page__source-username">@{model.owner.username}</span>
          </div>
          <div className="ga-fork-page__source-meta">
            <span>Elo {model.elo}</span>
            <span>{(model.winRate * 100).toFixed(0)}% win rate</span>
            <span>{model.matchesPlayed.toLocaleString()} matches</span>
            <span>{model.forkCount} forks</span>
          </div>
        </div>
      </Card>

      <Section title="New model name" testId="fork-name-section">
        <div className="ga-fork-page__field">
          <label htmlFor="fork-new-name">New model name</label>
          <input
            id="fork-new-name"
            type="text"
            value={name}
            onChange={(e) => setNameOverride(e.target.value)}
            required
            data-testid="fork-new-name"
          />
        </div>
      </Section>

      <Section
        title="Initial training config"
        subtitle="Optionally tweak the hyperparams before launching the fork."
        testId="fork-config-section"
      >
        <HyperparamForm value={hp} onChange={setHp} />
        {episodeError && (
          <span className="ga-fork-page__error" role="alert">
            {episodeError}
          </span>
        )}
      </Section>

      {submitError && (
        <ErrorState
          title="Could not fork"
          body={submitError.message}
          retry={() => setSubmitError(null)}
        />
      )}

      <div className="ga-fork-page__actions">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate(`/models/${model.id}`)}
          data-testid="fork-cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={Boolean(episodeError)}
          data-testid="fork-submit"
        >
          Create fork and start training
        </Button>
      </div>
    </form>
  );
}
