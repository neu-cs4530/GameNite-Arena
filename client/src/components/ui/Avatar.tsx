import "./Avatar.css";
import type { JSX } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarVariant = "default" | "human" | "ai";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  variant?: AvatarVariant;
  className?: string;
}

/** Stable, well-distributed hash of an arbitrary string -> [0, 360). */
function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  // Normalize to [0, 360)
  return ((hash % 360) + 360) % 360;
}

function initialsFrom(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Lightweight initials avatar. Color derived deterministically from the name.
 * No external images, no network, no PII leakage.
 */
export default function Avatar({
  name,
  size = "md",
  variant = "default",
  className = "",
}: AvatarProps): JSX.Element {
  const hue = hueFromString(name);
  const initials = initialsFrom(name);
  const style = {
    // Custom property consumed by the CSS — components downstream must not
    // hardcode color values; the gradient takes the hue and pulls saturation
    // from CSS tokens.
    "--avatar-hue": hue.toString(),
  } as React.CSSProperties;
  return (
    <span
      className={`ga-avatar ga-avatar--${size} ga-avatar--${variant} ${className}`.trim()}
      style={style}
      data-testid="avatar"
      aria-hidden="true"
    >
      <span className="ga-avatar__initials">{initials}</span>
    </span>
  );
}
