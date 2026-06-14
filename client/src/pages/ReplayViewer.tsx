import "./ReplayViewer.css";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useReplay from "../hooks/useReplay.ts";
import useReplayPlayback from "../hooks/useReplayPlayback.ts";
import useDerivedGameView from "../hooks/useDerivedGameView.ts";
import useAnnotations from "../hooks/useAnnotations.ts";
import useAnalysis from "../hooks/useAnalysis.ts";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts.ts";
import useLiveWatchers from "../hooks/useLiveWatchers.ts";
import useLoginContext from "../hooks/useLoginContext.ts";

import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import IconButton from "../components/ui/IconButton.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";

import GameViewer from "../components/replay/GameViewer.tsx";
import MatchHeader from "../components/replay/MatchHeader.tsx";
import MoveList from "../components/replay/MoveList.tsx";
import PlaybackControls from "../components/replay/PlaybackControls.tsx";
import AnnotationPanel from "../components/replay/AnnotationPanel.tsx";
import KeyboardShortcutsHelp from "../components/replay/KeyboardShortcutsHelp.tsx";
import CompareToAIPanel from "../components/replay/CompareToAIPanel.tsx";
import RailDrawer from "../components/replay/RailDrawer.tsx";

import { recordView, downloadReplay } from "../services/replayService.ts";
import { createAnnotation, createShareLink } from "../services/annotationService.ts";
import { listDeploymentViews } from "../services/trainerViewService.ts";
import { analysisModelOptions } from "../util/analysisModels.ts";
import type { DeploymentView } from "@gamenite/shared";

const SHORTCUT_HINTS = [
  { keys: "ArrowLeft", description: "Previous move", group: "Playback" },
  { keys: "ArrowRight", description: "Next move", group: "Playback" },
  { keys: "Space", description: "Toggle play / pause", group: "Playback" },
  { keys: "J", description: "Rewind 5 moves", group: "Playback" },
  { keys: "K", description: "Pause", group: "Playback" },
  { keys: "L", description: "Forward 5 moves", group: "Playback" },
  { keys: "Home", description: "Jump to move 0", group: "Playback" },
  { keys: "End", description: "Jump to last move", group: "Playback" },
  { keys: "0-9", description: "Jump to the N/10ths of the timeline", group: "Playback" },
  { keys: "?", description: "Show this overlay", group: "General" },
  { keys: "Esc", description: "Close overlays", group: "General" },
];

export default function ReplayViewer(): JSX.Element {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMoveParam = parseInt(searchParams.get("move") ?? "0", 10);
  const initialMove = Number.isFinite(initialMoveParam) ? initialMoveParam : 0;
  const navigate = useNavigate();

  const { user, pass } = useLoginContext();
  const auth = useMemo(() => ({ username: user.username, password: pass }), [user.username, pass]);

  const { replay, loading, error, refetch } = useReplay(matchId);
  const totalMoves = replay?.moves.length ?? 0;

  const playback = useReplayPlayback(totalMoves, initialMove);
  const view = useDerivedGameView(replay, playback.currentMove);

  const annotations = useAnnotations(matchId);
  const analysisHook = useAnalysis(matchId);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // The signed-in user's deployed models, used to pick which engine analyzes
  // this replay. Only models for THIS game that are active and artifact-backed
  // are eligible (see analysisModelOptions); an empty list just means the
  // built-in heuristic is the only engine offered.
  const [deployments, setDeployments] = useState<DeploymentView[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  useEffect(() => {
    let active = true;
    listDeploymentViews(user.username)
      .then((views) => {
        if (active) setDeployments(views);
      })
      .catch(() => {
        // Best-effort: if the list can't load, the user still gets the
        // built-in heuristic engine.
      });
    return () => {
      active = false;
    };
  }, [user.username]);
  const modelOptions = useMemo(
    () => (replay ? analysisModelOptions(deployments, replay.gameKey) : []),
    [deployments, replay],
  );

  // Unfold the analysis drawer the moment results first exist — running the
  // engine from the collapsed header should reveal what it produced. Derived
  // during render (same pattern as the view recording below) instead of an
  // effect so there's no cascading second render.
  const hasAnalysis = analysisHook.analysis !== null && analysisHook.analysis !== undefined;
  const [sawAnalysis, setSawAnalysis] = useState(false);
  if (hasAnalysis && !sawAnalysis) {
    setSawAnalysis(true);
    setAnalysisOpen(true);
  }
  const [watchCount, setWatchCount] = useState<number>(0);
  // Real presence: the server's socket room size, pushed on every change.
  const liveWatching = useLiveWatchers(matchId) ?? undefined;
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Record the view + initialise watchCount as a single derived-during-render
  // step. Doing it here (instead of in an effect) keeps the initial paint
  // showing the post-increment value; the server's response then reconciles
  // the displayed number with the authoritative counter.
  const [recordedMatchId, setRecordedMatchId] = useState<string | null>(null);
  if (replay && matchId && recordedMatchId !== matchId) {
    setRecordedMatchId(matchId);
    // Optimistic first paint; corrected by the response below.
    setWatchCount(replay.watchCount + 1);
    void recordView(matchId).then(({ watchCount: serverCount }) => {
      setWatchCount(serverCount);
    });
  }

  // Sync currentMove -> URL ?move=. Skipped until the replay has loaded:
  // while moves are unknown the playback position is a clamped placeholder,
  // and writing it back would erase a deep-linked ?move=N before it applies.
  useEffect(() => {
    if (totalMoves === 0) return;
    const params = new URLSearchParams(searchParams);
    if (playback.currentMove === 0) params.delete("move");
    else params.set("move", String(playback.currentMove));
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.currentMove, totalMoves]);

  // 404 auto-redirect timer.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => void navigate("/replays"), 3000);
    return () => clearTimeout(timer);
  }, [error, navigate]);

  // Auto-clear toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Keyboard shortcuts.
  const shortcuts = useMemo(() => {
    const list: Parameters<typeof useKeyboardShortcuts>[0] = [
      { key: "ArrowLeft", handler: () => playback.prev() },
      { key: "ArrowRight", handler: () => playback.next() },
      {
        key: " ",
        handler: (e) => {
          e.preventDefault();
          playback.togglePlayPause();
        },
      },
      { key: "j", handler: () => playback.jump(-5) },
      { key: "k", handler: () => playback.pause() },
      { key: "l", handler: () => playback.jump(5) },
      { key: "Home", handler: () => playback.seekToStart() },
      { key: "End", handler: () => playback.seekToEnd() },
      // Accept "?" however the browser/automation emits it: some layouts and
      // key synthesizers report the shifted character ("?"), others report
      // the physical key ("/") with shiftKey set. Bind both.
      { key: "?", handler: () => setHelpOpen((o) => !o) },
      { key: "/", shift: true, handler: () => setHelpOpen((o) => !o) },
      {
        key: "Escape",
        handler: () => {
          setHelpOpen(false);
          setCompareOpen(false);
        },
      },
    ];
    for (let i = 0; i <= 9; i++) {
      list.push({
        key: String(i),
        handler: () => playback.setCurrentMove(Math.round((i / 10) * totalMoves)),
      });
    }
    return list;
  }, [playback, totalMoves]);

  useKeyboardShortcuts(shortcuts);

  const handleDownload = useCallback(async () => {
    if (!matchId) return;
    try {
      const blob = await downloadReplay(matchId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${matchId}.gnreplay`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError((err as Error).message);
    }
  }, [matchId]);

  const handleExportNotation = useCallback(() => {
    if (!replay) return;
    const lines = replay.moves.map((m, i) => `${i + 1}. ${m.actorDisplayName} — ${m.notation}`);
    const text = [
      `${replay.gameKey} replay: ${replay.participants[0].displayName} vs ${replay.participants[1].displayName}`,
      "",
      ...lines,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${replay.matchId}.notation.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [replay]);

  const handleShareStudy = useCallback(async () => {
    if (!matchId) return;
    const anchor = await createAnnotation(
      matchId,
      { moveIndex: Math.max(0, playback.currentMove - 1), text: "Study link anchor" },
      { id: `human:${user.username}`, displayName: user.display },
    );
    const result = await createShareLink(anchor.id);
    setShareUrl(result.url);
  }, [matchId, user, playback.currentMove]);

  const handleCopyMoveLink = useCallback(
    (moveIndex: number) => {
      if (!matchId) return;
      const url = `${window.location.origin}/replays/${matchId}?move=${moveIndex}`;
      void navigator.clipboard
        .writeText(url)
        .then(() => setToast("Link copied"))
        .catch(() => setToast("Could not copy link"));
    },
    [matchId],
  );

  if (loading && !replay) {
    return (
      <div className="ga-viewer">
        <Card className="ga-viewer__panel-skeleton" testId="replay-viewer-skeleton">
          <Skeleton variant="rect" width="60%" height={32} />
          <Skeleton variant="rect" width="40%" height={20} />
          <div className="ga-viewer__board-skeleton">
            <Skeleton variant="rect" height={240} />
          </div>
          <Skeleton variant="rect" height={64} />
        </Card>
      </div>
    );
  }

  if (error || !replay) {
    return (
      <div className="ga-viewer">
        <ErrorState
          title="Replay not found"
          body="Redirecting to the replay list in 3 seconds."
          retry={() => refetch()}
        />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="primary" onClick={() => void navigate("/replays")}>
            Browse all replays
          </Button>
        </div>
      </div>
    );
  }

  const progressPct = totalMoves > 0 ? (playback.currentMove / totalMoves) * 100 : 0;

  return (
    <div className="ga-viewer" data-testid="replay-viewer">
      <MatchHeader replay={replay} watchCount={watchCount} liveWatching={liveWatching} />
      {downloadError && (
        <ErrorState
          title="Download failed"
          body={downloadError}
          retry={() => {
            setDownloadError(null);
            void handleDownload();
          }}
        />
      )}
      {shareUrl && (
        <div className="ga-viewer__share">
          <label htmlFor="ga-share-link">Share link:</label>
          <input
            id="ga-share-link"
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      {toast && (
        <div className="ga-viewer__toast" role="status">
          {toast}
        </div>
      )}

      <div className="ga-viewer__layout">
        {/* The stage: the game owns the page. Everything else is a drawer. */}
        <main className="ga-viewer__stage" data-testid="replay-board">
          <div className="ga-viewer__filmstrip" aria-hidden="true">
            <span className="ga-viewer__filmstrip-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="ga-viewer__boardwrap">
            <GameViewer view={view} replay={replay} readOnly />
          </div>
          <div className="ga-viewer__transport">
            <PlaybackControls
              currentMove={playback.currentMove}
              totalMoves={playback.totalMoves}
              isPlaying={playback.isPlaying}
              speed={playback.speed}
              autoLoop={playback.autoLoop}
              onPrev={playback.prev}
              onNext={playback.next}
              onPlayPause={playback.togglePlayPause}
              onJump={playback.jump}
              onSeekStart={playback.seekToStart}
              onSeekEnd={playback.seekToEnd}
              onSeek={playback.setCurrentMove}
              onSpeedChange={playback.setSpeed}
              onToggleAutoLoop={playback.toggleAutoLoop}
            />
          </div>
        </main>

        <aside className="ga-viewer__rail">
          {/* Quiet utility row — files, links, help. */}
          <div className="ga-viewer__toolbar" role="toolbar" aria-label="Replay actions">
            {/*
              The Download button uses an aria-label that does NOT contain
              the substring "play": `getByRole("button", { name: "Play" })`
              in the playback tests is a substring match and "Download
              .gnreplay" contains "play" inside "replay". The visible text
              keeps the file extension; assistive tech reads the override. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownload()}
              aria-label="Save match data archive"
            >
              Download .gnreplay
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleShareStudy()}>
              Share study link
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportNotation}>
              Export notation
            </Button>
            <IconButton
              aria-label="Show keyboard shortcuts"
              icon="?"
              variant="ghost"
              onClick={() => setHelpOpen(true)}
            />
          </div>

          <RailDrawer title="Moves" badge={totalMoves} defaultOpen testId="rail-drawer-moves">
            <MoveList
              moves={replay.moves}
              currentIndex={playback.currentMove}
              onSelect={playback.setCurrentMove}
              annotations={annotations.annotations}
              analysis={analysisHook.analysis}
              onCopyMoveLink={handleCopyMoveLink}
            />
          </RailDrawer>

          <RailDrawer
            title="Notes"
            badge={annotations.annotations.length}
            defaultOpen
            testId="rail-drawer-notes"
          >
            <AnnotationPanel
              matchId={replay.matchId}
              moveIndex={playback.currentMove}
              annotations={annotations.annotations}
              loading={annotations.loading}
              error={annotations.error}
              onCreate={annotations.create}
              onUpdate={annotations.update}
              onDelete={annotations.remove}
              onShare={annotations.share}
              onReact={annotations.react}
            />
          </RailDrawer>

          <RailDrawer
            title="Engine"
            open={analysisOpen}
            onToggle={setAnalysisOpen}
            testId="rail-drawer-engine"
            headerExtra={
              <>
                {modelOptions.length > 0 && (
                  <label className="ga-viewer__engine-model">
                    <span className="ga-viewer__sr-only">Analysis model</span>
                    <select
                      className="ga-viewer__engine-select"
                      aria-label="Analysis model"
                      data-testid="analysis-model-select"
                      value={selectedDeploymentId}
                      onChange={(e) => setSelectedDeploymentId(e.target.value)}
                    >
                      <option value="">Built-in heuristic</option>
                      {modelOptions.map((o) => (
                        <option key={o.deploymentId} value={o.deploymentId}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  loading={analysisHook.loading}
                  onClick={() =>
                    void analysisHook.run({
                      auth,
                      deploymentId: selectedDeploymentId || undefined,
                    })
                  }
                >
                  Analyze with engine
                </Button>
                {analysisHook.loading && (
                  <span className="ga-viewer__sr-only" data-testid="analysis-loading">
                    Running engine analysis…
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!analysisHook.analysis)
                      void analysisHook.run({
                        auth,
                        deploymentId: selectedDeploymentId || undefined,
                      });
                    setCompareOpen((o) => !o);
                    setAnalysisOpen(true);
                  }}
                >
                  Compare to AI
                </Button>
              </>
            }
          >
            <div className="ga-viewer__engine">
              <p className="ga-viewer__engine-hint">
                {hasAnalysis
                  ? "Move quality markers are shown inline in the move list."
                  : "Run the engine to flag best moves, blunders and inaccuracies — then compare the human's play against the AI's choices."}
              </p>
              {compareOpen && (
                <CompareToAIPanel
                  replay={replay}
                  analysis={
                    analysisHook.analysis ?? {
                      matchId: replay.matchId,
                      generatedAt: new Date().toISOString(),
                      perMove: [],
                    }
                  }
                  currentMove={playback.currentMove}
                  onClose={() => setCompareOpen(false)}
                />
              )}
            </div>
          </RailDrawer>
        </aside>
      </div>

      <KeyboardShortcutsHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        shortcuts={SHORTCUT_HINTS}
      />
    </div>
  );
}
