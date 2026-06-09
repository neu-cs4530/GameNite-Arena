import "./NewTrainingRun.css";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/ui/Button.tsx";
import Section from "../components/ui/Section.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import MultiToggle from "../components/filters/MultiToggle.tsx";
import Toggle from "../components/filters/Toggle.tsx";
import {
  CheckpointPicker,
  CostEstimator,
  HeuristicSourcePicker,
  HyperparamForm,
  ModeIndicator,
} from "../components/trainer/index.ts";
import type { HeuristicSourceMode } from "../components/trainer/HeuristicSourcePicker.tsx";
import { hyperparamPresets, trainerGameNames } from "../components/trainer/trainerConsts.ts";
import { getHelloWorldTemplate } from "../services/modelService.ts";
import { submitJob } from "../services/trainingService.ts";
import useUploadHeuristic from "../hooks/useUploadHeuristic.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import {
  ALL_GAME_KEYS,
  type CheckpointSummary,
  type TrainerGameKey,
  type TrainingHyperparameters,
} from "../util/types.ts";
import { MOCK_JOBS } from "../__mocks__/training.ts";

const defaultHp: TrainingHyperparameters = { episodes: 100_000, learningRate: 3e-4 };

const GAME_OPTIONS = ALL_GAME_KEYS.map((g) => ({ value: g, label: trainerGameNames[g] }));

export default function NewTrainingRun(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromCheckpoint = searchParams.get("fromCheckpoint");
  const fromTemplate = searchParams.get("fromTemplate");
  const fromJob = searchParams.get("fromJob");
  const presetParam = searchParams.get("preset");

  // Compute initial mode based on URL.
  const [mode, setMode] = useState<HeuristicSourceMode>(
    fromTemplate ? "template" : fromCheckpoint || fromJob ? "checkpoint" : "upload",
  );

  // The job-from prefill (if any) lets us pre-populate game + hp.
  const fromJobDetail = useMemo(() => {
    if (!fromJob) return null;
    return MOCK_JOBS.find((j) => j.id === fromJob) ?? null;
  }, [fromJob]);

  // Compute the initial hyperparams: preset > fromJob > default. Done in the
  // initializer rather than via useEffect/setState to satisfy the linter rule
  // forbidding `setState` calls inside `useEffect` bodies.
  const initialHp: TrainingHyperparameters = useMemo(() => {
    if (presetParam) {
      const preset = hyperparamPresets[presetParam as keyof typeof hyperparamPresets];
      if (preset) {
        return { episodes: preset.episodes, learningRate: preset.learningRate };
      }
    }
    if (fromJobDetail) return fromJobDetail.hyperparameters;
    return defaultHp;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [game, setGame] = useState<TrainerGameKey>(fromJobDetail?.gameKey ?? "nim");
  const [name, setName] = useState<string>(
    fromJobDetail ? `${fromJobDetail.modelDisplayName} re-run` : "New training run",
  );
  const [hp, setHp] = useState<TrainingHyperparameters>(initialHp);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateLoaded, setTemplateLoaded] = useState<{
    source: string;
    name: string;
  } | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(fromCheckpoint);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const upload = useUploadHeuristic();

  // Available checkpoints across user's previous jobs.
  const checkpoints: CheckpointSummary[] = useMemo(() => {
    return MOCK_JOBS.filter((j) => j.owner.username === user.username).flatMap(
      (j) => j.checkpoints,
    );
  }, [user.username]);

  // Load template on first paint when ?fromTemplate=hello-world.
  // The template is fetched lazily; we rely on a guard ref to avoid double-load.
  const templateLoadedRef = useRef(false);
  useEffect(() => {
    if (fromTemplate !== "hello-world") return;
    if (templateLoadedRef.current) return;
    templateLoadedRef.current = true;
    let cancelled = false;
    void getHelloWorldTemplate().then((t) => {
      if (cancelled) return;
      setTemplateLoaded(t);
      setName(t.name);
    });
    return () => {
      cancelled = true;
    };
  }, [fromTemplate]);

  const onUploadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".py")) {
        setUploadError("File must be a .py file matching the PyTorch adapter contract.");
        setUploadedFile(null);
        return;
      }
      setUploadError(null);
      setUploadedFile(file);
      await upload.upload(file, {
        displayName: name || file.name.replace(/\.py$/, ""),
        gameKey: game,
        visibility: "private",
      });
    },
    [upload, name, game],
  );

  function applyPreset(key: keyof typeof hyperparamPresets) {
    const p = hyperparamPresets[key];
    setHp((prev) => ({ ...prev, episodes: p.episodes, learningRate: p.learningRate }));
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("preset", key);
        return next;
      },
      { replace: true },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      let modelId: string | undefined = upload.modelId ?? undefined;
      if (mode === "checkpoint" && selectedCheckpoint) {
        const c = checkpoints.find((cp) => cp.id === selectedCheckpoint);
        if (c) modelId = c.modelId;
      }
      const { jobId } = await submitJob({
        modelId,
        checkpointId: mode === "checkpoint" ? (selectedCheckpoint ?? undefined) : undefined,
        gameKey: game,
        modelDisplayName: name || "New training run",
        hyperparameters: hp,
        notifyOnComplete,
      });
      // Persist auto-deploy preference for the live page badge.
      if (typeof window !== "undefined" && autoDeploy) {
        window.localStorage.setItem(`gnarena:autoDeploy:${jobId}`, "true");
      }
      void navigate(`/trainer/jobs/${jobId}`);
    } catch (err: unknown) {
      const e2 = err instanceof Error ? err : new Error(String(err));
      setSubmitError(e2);
    } finally {
      setSubmitting(false);
    }
  }

  const episodesError =
    hp.episodes < 1
      ? "Episode count must be at least 1."
      : hp.episodes > 10_000_000
        ? "Episode count cannot exceed 10,000,000."
        : null;
  const learningRateError =
    !Number.isFinite(hp.learningRate) || hp.learningRate <= 0 || hp.learningRate > 1 ? null : null;

  const canSubmit =
    !submitting && name.trim().length > 0 && episodesError === null && learningRateError === null;

  return (
    <form className="ga-new-run" onSubmit={onSubmit} data-testid="new-training-run">
      <header className="ga-new-run__hero">
        <h1>New training run</h1>
        <p>Configure a model, source a heuristic, and launch the run.</p>
      </header>

      <Section title="Heuristic source" subtitle="Where does the starting policy come from?">
        <HeuristicSourcePicker
          mode={mode}
          onModeChange={setMode}
          onUpload={(f) => void onUploadFile(f)}
          uploadProgress={upload.progress}
          uploadedFileName={uploadedFile?.name ?? upload.modelId ?? undefined}
          templateSource={templateLoaded?.source}
          templateName={templateLoaded?.name}
          checkpoints={checkpoints}
          checkpointValue={selectedCheckpoint}
          onCheckpointChange={setSelectedCheckpoint}
        />
        {uploadError && (
          <span className="ga-new-run__error" role="alert" data-testid="upload-error">
            {uploadError}
          </span>
        )}
        {mode === "template" && !templateLoaded && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void getHelloWorldTemplate().then((t) => {
                setTemplateLoaded(t);
                setName((cur) => (cur === "New training run" ? t.name : cur));
              });
            }}
            data-testid="hello-world-template-button"
          >
            Load hello world template
          </Button>
        )}
        {mode === "template" && templateLoaded && (
          <pre className="ga-new-run__preview" data-testid="source-preview">
            {templateLoaded.source}
          </pre>
        )}
        {mode === "checkpoint" && checkpoints.length > 0 && (
          <CheckpointPicker
            checkpoints={checkpoints}
            value={selectedCheckpoint}
            onChange={setSelectedCheckpoint}
          />
        )}
      </Section>

      <Section title="Game" subtitle="Single-select. Mode is derived from the choice.">
        <MultiToggle<TrainerGameKey>
          label="Game"
          value={[game]}
          options={GAME_OPTIONS}
          singleSelect
          onChange={(v) => setGame(v[0] ?? "nim")}
          testId="new-run-game"
        />
        <div className="ga-new-run__mode-row" data-testid="new-run-mode-row">
          <span>Training mode:</span>
          <ModeIndicator gameKey={game} testId="mode-indicator" />
        </div>
      </Section>

      <Section title="Model name" subtitle="A short, descriptive name for the resulting model.">
        <div className="ga-new-run__field">
          <label htmlFor="new-run-name">Model name</label>
          <input
            id="new-run-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="new-run-name"
            required
          />
        </div>
      </Section>

      <Section title="Hyperparameters" subtitle="Tune episode count, learning rate, and extras.">
        <HyperparamPresetBar onApply={applyPreset} />
        <HyperparamForm value={hp} onChange={setHp} />
        {episodesError && (
          <span className="ga-new-run__error" role="alert" data-testid="hp-episodes-error">
            {episodesError}
          </span>
        )}
        <ExtendedCostEstimator episodes={hp.episodes} />
      </Section>

      <Section title="Run options">
        <Toggle
          label="Auto-deploy on completion"
          checked={autoDeploy}
          onChange={setAutoDeploy}
          testId="auto-deploy-toggle"
        />
        <Toggle
          label="Notify me when training completes"
          checked={notifyOnComplete}
          onChange={setNotifyOnComplete}
          testId="notify-on-complete-toggle"
        />
      </Section>

      {submitError && (
        <ErrorState
          title="Could not start training"
          body={submitError.message}
          retry={() => setSubmitError(null)}
        />
      )}

      <div className="ga-new-run__submit-row">
        <Button type="button" variant="ghost" onClick={() => void navigate("/trainer")}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          loading={submitting}
          data-testid="new-run-submit"
        >
          Launch training run
        </Button>
      </div>
    </form>
  );
}

function HyperparamPresetBar({
  onApply,
}: {
  onApply: (key: keyof typeof hyperparamPresets) => void;
}): JSX.Element {
  return (
    <div className="ga-new-run__preset-bar" role="group" aria-label="Hyperparameter presets">
      {(Object.keys(hyperparamPresets) as Array<keyof typeof hyperparamPresets>).map((k) => (
        <Button
          key={k}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onApply(k)}
          data-testid={`preset-${k}`}
        >
          {k.charAt(0).toUpperCase() + k.slice(1)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Wraps the trainer-internal CostEstimator and adds the testids the
 * extra-features test asserts on (estimate-compute-time, estimate-slot-occupancy).
 */
function ExtendedCostEstimator({ episodes }: { episodes: number }): JSX.Element {
  return (
    <div className="ga-new-run__estimator">
      <CostEstimator episodes={episodes} />
      <div className="ga-new-run__estimator-detail">
        <span data-testid="estimate-compute-time">
          ~{Math.max(1, Math.round((episodes / 1000) * 0.1))} min compute
        </span>
        <span data-testid="estimate-slot-occupancy">1 slot occupied during training</span>
      </div>
    </div>
  );
}
