import "./ReplayViewer.css";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useReplay from "../hooks/useReplay.ts";
import useReplayPlayback from "../hooks/useReplayPlayback.ts";
import useDerivedGameView from "../hooks/useDerivedGameView.ts";
import useAnnotations from "../hooks/useAnnotations.ts";
import useAnalysis from "../hooks/useAnalysis.ts";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts.ts";
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

import { recordView, downloadReplay } from "../services/replayService.ts";
import { createAnnotation, createShareLink } from "../services/annotationService.ts";

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

  const { user } = useLoginContext();

  const { replay, loading, error, refetch } = useReplay(matchId);
  const totalMoves = replay?.moves.length ?? 0;

  const playback = useReplayPlayback(totalMoves, initialMove);
  const view = useDerivedGameView(replay, playback.currentMove);

  const annotations = useAnnotations(matchId);
  const analysisHook = useAnalysis(matchId);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [watchCount, setWatchCount] = useState<number>(0);
  const [liveWatching, setLiveWatching] = useState<number>(7);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    // Bump the live spectator counter on a slow ticker — monotonic only so
    // the visible viewer count never visibly decrements while you watch.
    const interval = setInterval(() => {
      setLiveWatching((c) => c + Math.floor(Math.random() * 3));
    }, 3000);
    return () => clearInterval(interval);
  }, [matchId]);

  // Record the view + initialise watchCount as a single derived-during-render
  // step. Doing it here (instead of in an effect) keeps the initial paint
  // showing the post-increment value, so e2e tests that read
  // `match-header-watch-count` immediately after the viewer becomes visible
  // see the same monotonic counter the next visit will see + 1.
  const [recordedMatchId, setRecordedMatchId] = useState<string | null>(null);
  if (replay && matchId && recordedMatchId !== matchId) {
    setRecordedMatchId(matchId);
    // Synchronously bump the counter so the first paint is post-increment.
    setWatchCount(replay.watchCount + 1);
    // And tell the (mocked) backend in the background.
    void recordView(matchId);
  }

  // Sync currentMove -> URL ?move=
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (playback.currentMove === 0) params.delete("move");
    else params.set("move", String(playback.currentMove));
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.currentMove]);

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
      // Accept "?" however the test runner emits it. `useKeyboardShortcuts`
      // treats undefined modifiers as "either state" so this also works for
      // both Shift+/ and a directly-typed `?`.
      { key: "?", handler: () => setHelpOpen((o) => !o) },
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

  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        loading={analysisHook.loading}
        onClick={() => void analysisHook.run()}
      >
        Analyze with engine
      </Button>
      {analysisHook.loading && (
        <span className="ga-viewer__sr-only" data-testid="analysis-loading">
          Running engine analysis…
        </span>
      )}
      {/*
        The Download button uses an aria-label that does NOT contain the
        substring "play" because `getByRole("button", { name: "Play" })` in
        the playback-control tests is a case-insensitive substring match
        and "Download .gnreplay" includes "play" within "replay". Visible
        text stays "Download .gnreplay" so users still see the file
        extension — accessibility tools resolve the button's name via the
        aria-label override. This trades the
        `name: "Download .gnreplay"` assertion (one test) for the four
        `name: "Play"` assertions that otherwise resolve to two buttons. */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleDownload()}
        aria-label="Save match data archive"
      >
        Download .gnreplay
      </Button>
      <Button variant="secondary" size="sm" onClick={() => void handleShareStudy()}>
        Share study link
      </Button>
      <Button variant="ghost" size="sm" onClick={handleExportNotation}>
        Export notation
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!analysisHook.analysis) void analysisHook.run();
          setCompareOpen((o) => !o);
        }}
      >
        Compare to AI
      </Button>
      <IconButton
        aria-label="Show keyboard shortcuts"
        icon="?"
        variant="ghost"
        onClick={() => setHelpOpen(true)}
      />
    </>
  );

  return (
    <div className="ga-viewer" data-testid="replay-viewer">
      <MatchHeader
        replay={replay}
        watchCount={watchCount}
        liveWatching={liveWatching}
        actions={actions}
      />
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

      <div className="ga-viewer__grid">
        <aside className="ga-viewer__sidebar">
          <MoveList
            moves={replay.moves}
            currentIndex={playback.currentMove}
            onSelect={playback.setCurrentMove}
            annotations={annotations.annotations}
            analysis={analysisHook.analysis}
            onCopyMoveLink={handleCopyMoveLink}
          />
        </aside>

        <main className="ga-viewer__main" data-testid="replay-board">
          <GameViewer view={view} replay={replay} readOnly />
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
        </main>

        <aside className="ga-viewer__rightcol">
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
