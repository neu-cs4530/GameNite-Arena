import "./ScopePills.css";
import type { JSX } from "react";
import { PROFILE_SCOPES, scopeLabel, type ProfileScope } from "./scopes.ts";

interface ScopePillsProps {
  scope: ProfileScope;
  onChange: (next: ProfileScope) => void;
}

/**
 * Single-select pill row scoping every element of the profile Overview tab.
 * Same radio semantics as the app's other single-select pill groups
 * (`MultiToggle singleSelect`); selection is reflected in `?scope=` by the
 * page, never refetched.
 */
export default function ScopePills({ scope, onChange }: ScopePillsProps): JSX.Element {
  return (
    <div
      className="ga-scope-pills"
      role="radiogroup"
      aria-label="Profile scope"
      data-testid="profile-scope-pills"
    >
      {PROFILE_SCOPES.map((s) => {
        const active = s === scope;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            className={`ga-scope-pills__pill ${active ? "ga-scope-pills__pill--active" : ""}`.trim()}
            data-testid={`scope-pill-${s}`}
            onClick={() => onChange(s)}
          >
            {scopeLabel(s)}
          </button>
        );
      })}
    </div>
  );
}
