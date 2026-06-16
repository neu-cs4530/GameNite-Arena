import "./ModelsBrowse.css";
import { useCallback, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Section from "../components/ui/Section.tsx";
import { ModelCard, ModelCardSkeleton } from "../components/trainer/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { listModels } from "../services/modelService.ts";

/**
 * /models — your trained models, straight from the live API. The server
 * has no global "all public models" list endpoint yet, so this page shows
 * exactly what exists (your models) and says so, rather than padding the
 * grid with fixtures.
 */
export default function ModelsBrowse(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useLoginContext();

  const models = useAsync(
    useCallback(() => listModels(user.username), [user.username]),
    [user.username],
  );

  return (
    <div className="ga-models-browse" data-testid="models-browse">
      <header className="ga-models-browse__hero">
        <div>
          <h1>Models</h1>
          <p>Every model you have trained or forked on FourNight Arena.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => void navigate("/trainer/new")}
          data-testid="new-training-run-cta"
        >
          New training run
        </Button>
      </header>

      <Section title="Your models" testId="models-browse-yours">
        {models.error ? (
          <ErrorState
            title="Could not load your models"
            body={models.error.message}
            retry={models.refetch}
          />
        ) : models.data === null ? (
          <div className="ga-models-browse__grid" data-testid="browse-grid-skeleton">
            {Array.from({ length: 6 }).map((_, i) => (
              <ModelCardSkeleton key={i} />
            ))}
          </div>
        ) : models.data.length === 0 ? (
          <EmptyState
            title="No models yet"
            body="Register a training run, train on your machine, and your model appears here."
            action={
              <Button onClick={() => void navigate("/trainer/new")} data-testid="empty-new-run">
                Start your first run
              </Button>
            }
            testId="browse-empty"
          />
        ) : (
          <div className="ga-models-browse__grid" data-testid="browse-grid">
            {models.data.map((m) => (
              <ModelCard key={m.id} model={m} isOwner />
            ))}
          </div>
        )}
      </Section>

      <p className="ga-models-browse__coming" data-testid="browse-all-note">
        Browsing everyone&apos;s public models arrives once the server exposes a global model list.
      </p>
    </div>
  );
}
