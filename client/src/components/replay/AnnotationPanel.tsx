import "./AnnotationPanel.css";
import { useState, type JSX } from "react";
import type {
  AnnotationMarker,
  AnnotationView,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
} from "../../util/types.ts";
import Button from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";
import Badge, { type BadgeVariant } from "../ui/Badge.tsx";
import Skeleton from "../ui/Skeleton.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import UserLink from "../ui/UserLink.tsx";

interface AnnotationPanelProps {
  matchId: string;
  moveIndex: number;
  annotations: AnnotationView[];
  loading: boolean;
  error: Error | null;
  onCreate: (payload: CreateAnnotationPayload) => Promise<void>;
  onUpdate: (id: string, payload: UpdateAnnotationPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onShare: (id: string) => Promise<{ url: string; token: string } | null>;
  onReact: (id: string, reaction: "thumbsUp" | "thumbsDown", delta: 1 | -1) => Promise<void>;
  readOnly?: boolean;
}

interface MarkerChoiceProps {
  label: string;
  value: AnnotationMarker;
  checked: boolean;
  onChange: () => void;
}

/**
 * Marker control rendered as an `aria-pressed` toggle button. Using a button
 * (instead of a `<label><input type=checkbox visuallyHidden>`) keeps the
 * click target visually identical with the chip BUT avoids Playwright's
 * "label intercepts pointer events" failure mode that comes from clicking a
 * hidden checkbox under a label that owns the visual hit-box.
 *
 * The accessible name still reads "Marker {value}" so the e2e tests that
 * call `getByLabel("Marker good")` keep working.
 */
function MarkerChoice({ label, value, checked, onChange }: MarkerChoiceProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={`Marker ${value}`}
      className={`ga-annotation-panel__marker ${
        checked ? "ga-annotation-panel__marker--active" : ""
      }`}
      onClick={onChange}
    >
      {label}
    </button>
  );
}

const MARKER_OPTIONS: { value: AnnotationMarker; label: string; variant: BadgeVariant }[] = [
  { value: "good", label: "Good", variant: "marker-good" },
  { value: "interesting", label: "Interesting", variant: "marker-interesting" },
  { value: "questionable", label: "Questionable", variant: "marker-questionable" },
  { value: "bad", label: "Bad", variant: "marker-bad" },
  { value: "winning", label: "Winning", variant: "marker-winning" },
];

function markerVariant(marker?: AnnotationMarker): BadgeVariant | null {
  if (!marker) return null;
  return MARKER_OPTIONS.find((m) => m.value === marker)?.variant ?? "default";
}

export default function AnnotationPanel({
  moveIndex,
  annotations,
  loading,
  error,
  onCreate,
  onUpdate,
  onDelete,
  onShare,
  onReact,
  readOnly,
}: AnnotationPanelProps): JSX.Element {
  const [text, setText] = useState("");
  const [marker, setMarker] = useState<AnnotationMarker | "">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMarker, setEditMarker] = useState<AnnotationMarker | "">("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  /** Per-annotation user-applied reaction state (mock; localStorage-backed). */
  const [userReactions, setUserReactions] = useState<
    Record<string, "thumbsUp" | "thumbsDown" | null>
  >({});

  const filtered = annotations.filter((a) => a.moveIndex === moveIndex);

  async function submit() {
    if (!text.trim()) return;
    await onCreate({
      moveIndex,
      text: text.trim(),
      marker: marker || undefined,
    });
    setText("");
    setMarker("");
  }

  async function submitEdit() {
    if (!editId) return;
    await onUpdate(editId, {
      text: editText.trim(),
      marker: editMarker || null,
    });
    setEditId(null);
    setEditText("");
    setEditMarker("");
  }

  function startEdit(a: AnnotationView) {
    setEditId(a.id);
    setEditText(a.text);
    setEditMarker(a.marker ?? "");
  }

  async function share(id: string) {
    const result = await onShare(id);
    if (result) setShareUrl(result.url);
  }

  async function toggleReaction(id: string, reaction: "thumbsUp" | "thumbsDown") {
    let nextState: "thumbsUp" | "thumbsDown" | null = null;
    let previousState: "thumbsUp" | "thumbsDown" | null = null;
    setUserReactions((prev) => {
      const current = prev[id] ?? null;
      previousState = current;
      nextState = current === reaction ? null : reaction;
      return { ...prev, [id]: nextState };
    });
    // Replay the transition into the service so the count stored on the
    // annotation tracks the user-visible counter. If the user clears a
    // reaction the count decrements; switching reactions decrements the
    // previous side and increments the new side.
    if (previousState === reaction) {
      // Reaction was active, now cleared -> decrement.
      await onReact(id, reaction, -1);
    } else {
      if (previousState) {
        // Switching from the other reaction -> decrement the other side.
        await onReact(id, previousState, -1);
      }
      // And bump the side the user just clicked on.
      await onReact(id, reaction, 1);
    }
  }

  return (
    <aside className="ga-annotation-panel" data-testid="annotation-panel" aria-label="Annotations">
      <header className="ga-annotation-panel__header">
        <h3>Move {moveIndex} annotations</h3>
        <span className="ga-annotation-panel__count">
          {filtered.length} {filtered.length === 1 ? "note" : "notes"}
        </span>
      </header>

      {error && (
        <div className="ga-annotation-panel__error" role="alert">
          {error.message}
        </div>
      )}

      {loading ? (
        <div className="ga-annotation-panel__list" aria-busy="true" data-testid="annotation-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ga-annotation-panel__skel" data-testid="annotation-skeleton">
              <Skeleton variant="rect" width="60%" height={16} />
              <Skeleton variant="text" />
              <Skeleton variant="text" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="ga-annotation-panel__list" data-testid="annotation-list">
          {filtered.length === 0 && (
            <li className="ga-annotation-panel__empty" data-testid="annotation-empty">
              No annotations for this move yet
              {readOnly ? "" : " — be the first."}
            </li>
          )}
          {filtered.map((a) => {
            const variant = markerVariant(a.marker);
            const isEditing = editId === a.id;
            const isConfirming = confirmDelete === a.id;
            const userReaction = userReactions[a.id] ?? null;
            return (
              <li
                key={a.id}
                className="ga-annotation-panel__row"
                data-testid="annotation-item"
                data-annotation-id={a.id}
              >
                <div className="ga-annotation-panel__row-head">
                  <UserLink
                    name={a.authorDisplayName}
                    username={a.authorUsername}
                    type="human"
                    className="ga-annotation-panel__author"
                  />
                  <TimeAgo date={a.createdAt} />
                  {variant && <Badge variant={variant}>{a.marker}</Badge>}
                </div>
                {isEditing ? (
                  <div className="ga-annotation-panel__edit">
                    <textarea
                      className="ga-annotation-panel__textarea"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label="Annotation text"
                    />
                    <div
                      className="ga-annotation-panel__markers"
                      role="radiogroup"
                      aria-label="Marker"
                    >
                      {MARKER_OPTIONS.map((m) => (
                        <MarkerChoice
                          key={m.value}
                          label={m.label}
                          value={m.value}
                          checked={editMarker === m.value}
                          onChange={() => setEditMarker(editMarker === m.value ? "" : m.value)}
                        />
                      ))}
                    </div>
                    <div className="ga-annotation-panel__edit-actions">
                      <Button variant="primary" size="sm" onClick={() => void submitEdit()}>
                        Save annotation
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="ga-annotation-panel__text">{a.text}</p>
                )}
                {!isEditing && (
                  <div className="ga-annotation-panel__row-actions">
                    <div className="ga-annotation-panel__reactions">
                      <button
                        type="button"
                        aria-label="Thumbs up"
                        aria-pressed={userReaction === "thumbsUp"}
                        className={`ga-annotation-panel__react ${
                          userReaction === "thumbsUp" ? "ga-annotation-panel__react--active" : ""
                        }`}
                        onClick={() => void toggleReaction(a.id, "thumbsUp")}
                      >
                        ▲{" "}
                        <span data-testid="annotation-thumbs-up-count">{a.reactions.thumbsUp}</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Thumbs down"
                        aria-pressed={userReaction === "thumbsDown"}
                        className={`ga-annotation-panel__react ${
                          userReaction === "thumbsDown" ? "ga-annotation-panel__react--active" : ""
                        }`}
                        onClick={() => void toggleReaction(a.id, "thumbsDown")}
                      >
                        ▼{" "}
                        <span data-testid="annotation-thumbs-down-count">
                          {a.reactions.thumbsDown}
                        </span>
                      </button>
                    </div>
                    {!readOnly && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>
                          Edit
                        </Button>
                        {isConfirming ? (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                void onDelete(a.id);
                                setConfirmDelete(null);
                              }}
                            >
                              Confirm delete
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(a.id)}>
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                    {!readOnly && (
                      <IconButton
                        aria-label="Share annotation"
                        icon="↗"
                        size="sm"
                        variant="ghost"
                        onClick={() => void share(a.id)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <form
          className="ga-annotation-panel__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="ga-annotation-panel__label">
            <span>Add a note about move {moveIndex}</span>
            <textarea
              className="ga-annotation-panel__textarea"
              placeholder="What's interesting about this move?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Annotation text"
            />
          </label>
          <div className="ga-annotation-panel__markers" role="radiogroup" aria-label="Marker">
            {MARKER_OPTIONS.map((m) => (
              <MarkerChoice
                key={m.value}
                label={m.label}
                value={m.value}
                checked={marker === m.value}
                onChange={() => setMarker(marker === m.value ? "" : m.value)}
              />
            ))}
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={!text.trim()}>
            Save annotation
          </Button>
        </form>
      )}

      {shareUrl && (
        <div className="ga-annotation-panel__share">
          <p>Share link:</p>
          <input
            readOnly
            value={shareUrl}
            className="ga-annotation-panel__share-input"
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
          />
        </div>
      )}
    </aside>
  );
}
