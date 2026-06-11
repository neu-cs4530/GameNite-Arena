import "./UserLink.css";
import type { JSX, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

interface UserLinkProps {
  /** Display name shown as link text. */
  name: string;
  /** Username — present for humans, not for AI deployments. */
  username?: string;
  /** AI deployments link to their model card; supply the model id. */
  modelId?: string;
  /** Discriminates routing: humans go to /profile, AI go to /models. */
  type?: "human" | "ai";
  /** Optional title attribute (defaults to the name). */
  title?: string;
  /** Children override the name (lets callers wrap richer content). */
  children?: ReactNode;
  /** Optional extra class on the rendered element. */
  className?: string;
  /** When true, render plain text without the link-color underline accent. */
  subtle?: boolean;
  testId?: string;
}

/**
 * Tiny abstraction for "this name should be a clickable profile / model link".
 *
 * - Humans with a username link to `/profile/:username`.
 * - AIs link to `/models/:modelId` (so the deployment's underlying model card
 *   is one click away).
 * - Anything else (missing username, unknown type) renders as plain text so
 *   the layout stays consistent.
 *
 * Click propagation is always stopped: it's safe to render this inside another
 * clickable element (like `<MatchCard>`).
 */
export default function UserLink({
  name,
  username,
  modelId,
  type = "human",
  title,
  children,
  className = "",
  subtle = false,
  testId,
}: UserLinkProps): JSX.Element {
  const cls = ["ga-userlink", subtle ? "ga-userlink--subtle" : "", className]
    .filter(Boolean)
    .join(" ");

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
  };

  if (type === "human" && username) {
    return (
      <Link
        to={`/profile/${username}`}
        className={cls}
        title={title ?? name}
        onClick={stop}
        data-testid={testId ?? "user-link"}
      >
        {children ?? name}
      </Link>
    );
  }

  if (type === "ai" && modelId) {
    return (
      <Link
        to={`/models/${modelId}`}
        className={cls}
        title={title ?? `${name} (AI model card)`}
        onClick={stop}
        data-testid={testId ?? "model-link"}
      >
        {children ?? name}
      </Link>
    );
  }

  return (
    <span className={cls} title={title ?? name} data-testid={testId ?? "user-link-plain"}>
      {children ?? name}
    </span>
  );
}
