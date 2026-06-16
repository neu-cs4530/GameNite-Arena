import "./HighlightsSection.css";
import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_HIGHLIGHT_MOVES_BACK, MAX_HIGHLIGHT_MOVES_BACK } from "@gamenite/shared";
import useAuth from "../../hooks/useAuth.ts";
import useHighlights from "../../hooks/useHighlights.ts";
import { createHighlight } from "../../services/highlightService.ts";
import { replayGameNames } from "../../util/consts.ts";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * The live viewer's highlight section (Story 3.12): save a clip of the last N
 * moves of this broadcast, and watch the highlights you've saved. The move
 * window defaults to 7; fewer moves than that just saves all of them.
 */
export default function HighlightsSection({ broadcastId }: { broadcastId: string }): JSX.Element {
  const auth = useAuth();
  const { data, loading, error, refetch } = useHighlights();
  const [movesBack, setMovesBack] = useState(DEFAULT_HIGHLIGHT_MOVES_BACK);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const highlights = data ?? [];

  async function save(): Promise<void> {
    setStatus("saving");
    try {
      await createHighlight(auth, { broadcastId, movesBack, note: name.trim() || undefined });
      setStatus("saved");
      setName("");
      refetch();
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  const saveLabel =
    status === "saved" ? "Saved ✓" : status === "error" ? "Try again" : "★ Save highlight";

  return (
    <section className="ga-highlights-section" data-testid="highlights-section">
      <div className="ga-highlights-section__save">
        <label className="ga-highlights-section__field ga-highlights-section__field--name">
          <span>Clip name</span>
          <input
            type="text"
            value={name}
            placeholder="Optional"
            maxLength={280}
            onChange={(e) => setName(e.target.value)}
            data-testid="highlight-name"
          />
        </label>
        <label className="ga-highlights-section__field">
          <span>Moves back</span>
          <input
            type="number"
            min={1}
            max={MAX_HIGHLIGHT_MOVES_BACK}
            value={movesBack}
            onChange={(e) =>
              setMovesBack(
                Math.min(MAX_HIGHLIGHT_MOVES_BACK, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            data-testid="highlight-moves-back"
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          loading={status === "saving"}
          onClick={() => void save()}
          data-testid="highlight-save"
        >
          {saveLabel}
        </Button>
      </div>

      {error ? (
        <p className="ga-highlights-section__msg">Couldn't load your highlights.</p>
      ) : loading && !data ? (
        <p className="ga-highlights-section__msg">Loading…</p>
      ) : highlights.length === 0 ? (
        <p className="ga-highlights-section__msg">
          No highlights yet — save the last few moves above.
        </p>
      ) : (
        <ul className="ga-highlights-section__list" data-testid="highlights-list">
          {highlights.map((h) => {
            // Old highlights may predate the clip fields — default them.
            const moveCount = h.moves?.length ?? 0;
            const gameName = h.gameKey ? replayGameNames[h.gameKey] : "Match";
            const watchTo =
              moveCount > 0
                ? `/replays/${h.gameId}?from=${h.startIndex ?? 0}&clip=${moveCount}`
                : `/replays/${h.gameId}`;
            return (
              <li key={h.highlightId} className="ga-highlights-section__item">
                <span className="ga-highlights-section__note">
                  {h.note || `${moveCount}-move clip`}
                </span>
                <span className="ga-highlights-section__time">
                  {gameName} (<TimeAgo date={h.capturedAt} />)
                </span>
                <Link to={watchTo} className="ga-highlights-section__watch">
                  Watch ↗
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
