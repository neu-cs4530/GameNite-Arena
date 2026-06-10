import "./HyperparamForm.css";
import { useId, useState, type JSX } from "react";
import HyperparamInput from "./HyperparamInput.tsx";
import { hyperparamPresets } from "./trainerConsts.ts";
import type { TrainingHyperparameters } from "../../util/types.ts";

interface HyperparamFormProps {
  value: TrainingHyperparameters;
  onChange: (next: TrainingHyperparameters) => void;
}

/** Episode count + learning rate + extra-config JSON inputs with validation. */
export default function HyperparamForm({ value, onChange }: HyperparamFormProps): JSX.Element {
  const id = useId();
  const [extraConfigText, setExtraConfigText] = useState(() =>
    value.extraConfig ? JSON.stringify(value.extraConfig, null, 2) : "",
  );
  const [extraConfigError, setExtraConfigError] = useState<string | null>(null);

  function applyPreset(preset: keyof typeof hyperparamPresets) {
    const p = hyperparamPresets[preset];
    onChange({ ...value, episodes: p.episodes, learningRate: p.learningRate });
  }

  function commitExtraConfig(text: string) {
    setExtraConfigText(text);
    const trimmed = text.trim();
    if (!trimmed) {
      setExtraConfigError(null);
      onChange({ ...value, extraConfig: undefined });
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Must be a JSON object");
      }
      setExtraConfigError(null);
      onChange({ ...value, extraConfig: parsed });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : "Invalid JSON";
      setExtraConfigError(err);
    }
  }

  function activePreset(): keyof typeof hyperparamPresets | null {
    const presetKeys = Object.keys(hyperparamPresets) as Array<keyof typeof hyperparamPresets>;
    return (
      presetKeys.find(
        (k) =>
          hyperparamPresets[k].episodes === value.episodes &&
          hyperparamPresets[k].learningRate === value.learningRate,
      ) ?? null
    );
  }
  const presetActive = activePreset();

  return (
    <div className="ga-hp-form" data-testid="hyperparam-form">
      <div className="ga-hp-form__presets" role="group" aria-label="Hyperparameter presets">
        {(Object.keys(hyperparamPresets) as Array<keyof typeof hyperparamPresets>).map((k) => {
          const p = hyperparamPresets[k];
          const active = presetActive === k;
          return (
            <button
              key={k}
              type="button"
              className={`ga-hp-form__preset ${active ? "ga-hp-form__preset--active" : ""}`.trim()}
              onClick={() => applyPreset(k)}
              aria-pressed={active}
              data-testid={`hp-preset-${k}`}
            >
              <span className="ga-hp-form__preset-name">{k}</span>
              <span className="ga-hp-form__preset-desc">{p.description}</span>
              <span className="ga-hp-form__preset-desc">
                {p.episodes.toLocaleString()} ep · lr {p.learningRate}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ga-hp-form__row">
        <HyperparamInput
          label="Episode count"
          value={value.episodes}
          onChange={(v) => onChange({ ...value, episodes: v })}
          min={1}
          max={10_000_000}
          step={1000}
          hint="Default 100,000. Min 1, max 10,000,000."
          testId="hp-episodes"
        />
        <HyperparamInput
          label="Learning rate"
          value={value.learningRate}
          onChange={(v) => onChange({ ...value, learningRate: v })}
          min={0}
          max={1}
          scientific
          hint="Scientific notation OK, e.g. 3e-4. Range 0 < lr ≤ 1."
          testId="hp-learning-rate"
        />
      </div>

      <div>
        <label htmlFor={`${id}-extra`} className="ga-hpi__label">
          Extra config (JSON, optional)
        </label>
        <textarea
          id={`${id}-extra`}
          rows={4}
          placeholder='{"hiddenSize": 128}'
          value={extraConfigText}
          onChange={(e) => commitExtraConfig(e.target.value)}
          className={`ga-hp-form__textarea ${extraConfigError ? "ga-hp-form__textarea--error" : ""}`.trim()}
          aria-invalid={extraConfigError ? true : undefined}
          data-testid="hp-extra-config"
        />
        {extraConfigError && (
          <span className="ga-hp-form__error" role="alert" data-testid="hp-extra-config-error">
            {extraConfigError}
          </span>
        )}
      </div>
    </div>
  );
}
