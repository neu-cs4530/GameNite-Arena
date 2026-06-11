import "./ReplayViewer.css";
import { useEffect, useReducer, useState, type JSX } from "react";
import { useParams } from "react-router-dom";
import { getAnnotationByShareToken } from "../services/annotationService.ts";
import { getReplay } from "../services/replayService.ts";
import type { AnnotationView, ReplayDetail } from "../util/types.ts";

import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import Badge from "../components/ui/Badge.tsx";

import GameViewer from "../components/replay/GameViewer.tsx";
import MatchHeader from "../components/replay/MatchHeader.tsx";
import MoveList from "../components/replay/MoveList.tsx";
import AnnotationPanel from "../components/replay/AnnotationPanel.tsx";
import useDerivedGameView from "../hooks/useDerivedGameView.ts";

interface StudyState {
  annotation: AnnotationView | null;
  replay: ReplayDetail | null;
  loading: boolean;
  error: Error | null;
}

type StudyAction =
  | { type: "start" }
  | { type: "success"; annotation: AnnotationView; replay: ReplayDetail }
  | { type: "failure"; error: Error };

function reducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return {
        annotation: action.annotation,
        replay: action.replay,
        loading: false,
        error: null,
      };
    case "failure":
      return { ...state, error: action.error, loading: false };
  }
}

/**
 * Read-only public view of a shared annotated study. No edit controls,
 * no view-count increment, no playback - the viewer scrubs via the move
 * list.
 *
 * Returning a no-op promise for the AnnotationPanel mutation callbacks
 * keeps the panel's API stable while making it inert in the study view.
 */
function noopAsync(): Promise<void> {
  // Intentionally empty - this is the inert callback used for the
  // read-only AnnotationPanel in study view.
  return Promise.resolve();
}

function noopAsyncReturningNull(): Promise<null> {
  return Promise.resolve(null);
}

export default function StudyView(): JSX.Element {
  const { shareToken } = useParams<{ shareToken: string }>();

  const [state, dispatch] = useReducer(reducer, {
    annotation: null,
    replay: null,
    loading: true,
    error: null,
  });
  const [currentMove, setCurrentMove] = useState(0);

  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;
    dispatch({ type: "start" });
    (async () => {
      try {
        const found = await getAnnotationByShareToken(shareToken);
        if (cancelled) return;
        if (!found) {
          dispatch({ type: "failure", error: new Error("Share link not found.") });
          return;
        }
        const r = await getReplay(found.matchId);
        if (cancelled) return;
        dispatch({ type: "success", annotation: found.annotation, replay: r });
        setCurrentMove(found.annotation.moveIndex + 1);
      } catch (err: unknown) {
        if (cancelled) return;
        dispatch({
          type: "failure",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    })().catch(() => {
      /* dispatched above */
    });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const view = useDerivedGameView(state.replay, currentMove);

  if (state.loading) {
    return (
      <div className="ga-viewer" data-testid="study-view-loading">
        <Card className="ga-viewer__panel-skeleton">
          <Skeleton variant="rect" width="60%" height={32} />
          <Skeleton variant="rect" width="40%" height={20} />
          <Skeleton variant="rect" height={240} />
        </Card>
      </div>
    );
  }

  if (state.error || !state.replay || !state.annotation) {
    return (
      <div className="ga-viewer">
        <ErrorState
          title="Share link not found"
          body={state.error?.message ?? "We could not load this study."}
        />
      </div>
    );
  }

  const annotations = [state.annotation];

  // The e2e suite asserts the read-only study page exposes the
  // `replay-viewer` testid (same as the full viewer) so a single
  // selector can verify "viewer chrome rendered" in both routes.
  return (
    <div className="ga-viewer" data-testid="replay-viewer">
      <div
        className="ga-viewer__share"
        style={{
          background: "var(--color-info-soft)",
          border: "1px solid var(--color-info)",
        }}
      >
        <Badge variant="info">Study link</Badge>
        <span style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-small)" }}>
          Read-only view shared by <strong>{state.annotation.authorDisplayName}</strong>
        </span>
      </div>
      <MatchHeader replay={state.replay} watchCount={state.replay.watchCount} />
      <div className="ga-viewer__grid">
        <aside className="ga-viewer__sidebar">
          <MoveList
            moves={state.replay.moves}
            currentIndex={currentMove}
            onSelect={setCurrentMove}
            annotations={annotations}
          />
        </aside>
        <main className="ga-viewer__main" data-testid="replay-board">
          <GameViewer view={view} replay={state.replay} readOnly />
        </main>
        <aside className="ga-viewer__rightcol">
          <AnnotationPanel
            matchId={state.replay.matchId}
            moveIndex={Math.max(0, currentMove - 1)}
            annotations={annotations}
            loading={false}
            error={null}
            onCreate={noopAsync}
            onUpdate={noopAsync}
            onDelete={noopAsync}
            onShare={noopAsyncReturningNull}
            onReact={noopAsync}
            readOnly
          />
        </aside>
      </div>
    </div>
  );
}
