import "./LiveViewer.css";
import { useEffect, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { GameInfo } from "@gamenite/shared";
import useBroadcast from "../hooks/useBroadcast.ts";
import { getGameById } from "../services/gameService.ts";
import { replayGameNames } from "../util/consts.ts";

import RailDrawer from "../components/replay/RailDrawer.tsx";
import LiveBoard from "../components/live/LiveBoard.tsx";
import BroadcastChatPanel from "../components/live/BroadcastChatPanel.tsx";
import HighlightsSection from "../components/live/HighlightsSection.tsx";
import LiveDot from "../components/live/LiveDot.tsx";
import Button from "../components/ui/Button.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";

/**
 * Spectate a live broadcast. Loads the broadcast + its game info, then renders
 * the delayed game view as it streams in, alongside the moderated broadcast
 * chat (which reuses the in-game chat box). Because the broadcaster's delay
 * means there's no initial snapshot, the board shows a "waiting for the next
 * move" state until the first relayed update arrives.
 */
export default function LiveViewer(): JSX.Element {
  const { broadcastId } = useParams<{ broadcastId: string }>();
  const navigate = useNavigate();
  const { info, view, ended, error } = useBroadcast(broadcastId);

  const [game, setGame] = useState<GameInfo | null>(null);
  useEffect(() => {
    if (!info) return;
    let active = true;
    getGameById(info.gameId)
      .then((g) => {
        if (active) setGame(g);
      })
      .catch(() => {
        /* header/board degrade gracefully without game info */
      });
    return () => {
      active = false;
    };
  }, [info]);

  if (error) {
    return (
      <div className="ga-live-viewer">
        <ErrorState
          title="Broadcast not found"
          body="It may have ended or never existed."
          retry={() => void navigate("/live")}
        />
        <div className="ga-live-viewer__center">
          <Button variant="primary" onClick={() => void navigate("/live")}>
            Browse live games
          </Button>
        </div>
      </div>
    );
  }

  const gameKey = game?.type ?? view?.type;
  const players = game?.players ?? [];
  const title = gameKey ? replayGameNames[gameKey] : "Live game";
  const playerLine = players.length > 0 ? players.map((p) => p.display).join("  vs  ") : "";

  return (
    <div className="ga-live-viewer" data-testid="live-viewer">
      <header className="ga-live-viewer__header">
        <div className="ga-live-viewer__titlebar">
          <h1 className="ga-live-viewer__title">{title}</h1>
          {!ended && <LiveDot testId="live-viewer-livedot" />}
        </div>
        {playerLine && <div className="ga-live-viewer__players">{playerLine}</div>}
        {info && !ended && (
          <div className="ga-live-viewer__delay" data-testid="live-viewer-delay">
            {info.delaySec > 0
              ? `Delayed ${info.delaySec}s behind live`
              : "Streaming with no delay"}
          </div>
        )}
      </header>

      <div className="ga-live-viewer__layout">
        <main className="ga-live-viewer__stage" data-testid="live-board">
          {ended ? (
            <div className="ga-live-viewer__notice" data-testid="live-ended">
              This broadcast has ended.
              <Button variant="ghost" size="sm" onClick={() => void navigate("/live")}>
                Browse live games
              </Button>
            </div>
          ) : view ? (
            <div className="ga-live-viewer__boardwrap">
              <LiveBoard view={view} players={players} />
            </div>
          ) : (
            <div className="ga-live-viewer__notice" data-testid="live-waiting">
              Waiting for the next move…
            </div>
          )}
        </main>

        <aside className="ga-live-viewer__rail">
          <RailDrawer title="Chat" defaultOpen testId="rail-drawer-chat">
            {info ? (
              <BroadcastChatPanel chatChannel={info.chatChannel} broadcastId={info.broadcastId} />
            ) : (
              <div className="ga-live-viewer__chat-loading">Connecting…</div>
            )}
          </RailDrawer>
          <RailDrawer title="Highlights" defaultOpen testId="rail-drawer-highlights">
            {info ? (
              <HighlightsSection broadcastId={info.broadcastId} />
            ) : (
              <div className="ga-live-viewer__chat-loading">Connecting…</div>
            )}
          </RailDrawer>
        </aside>
      </div>
    </div>
  );
}
