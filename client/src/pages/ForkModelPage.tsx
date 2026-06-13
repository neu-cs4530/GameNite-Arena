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
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useModel from "../hooks/useModel.ts";
import { forkModel } from "../services/modelService.ts";

/**
 * Forking is now exactly one real API call: name your copy, the server
 * clones the model record (and artifact, when one exists), and you land on
 * the new-run form pre-filled to continue training the fork.
 */
export default function ForkModelPage(): JSX.Element {
  const { modelId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { model, loading, error, refetch } = useModel(modelId);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
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
      const fork = await forkModel(model.id, name.trim() || `Fork of ${model.displayName}`, auth);
      void navigate(`/trainer/new?fromModel=${encodeURIComponent(fork.modelId)}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err : new Error(String(err)));
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
      </div>
    );
  }

  return (
    <form className="ga-fork-page" data-testid="fork-model-page" onSubmit={handleSubmit}>
      <header className="ga-fork-page__hero">
        <h1>Fork model</h1>
        <p>Make your own copy of this model, then continue training it from where it left off.</p>
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
          disabled={name.trim().length === 0}
          data-testid="fork-submit"
        >
          Fork and continue training
        </Button>
      </div>
    </form>
  );
}
