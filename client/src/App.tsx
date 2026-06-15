/* eslint no-console: "off" */

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useState } from "react";
import Login from "./pages/Login.tsx";
import type { AuthContext } from "./contexts/LoginContext.ts";
import Layout from "./components/Layout.tsx";
import Home from "./pages/Home.tsx";
import ThreadList from "./pages/ThreadList.tsx";
import Profile from "./pages/Profile.tsx";
import { io } from "socket.io-client";
import type { GameSocket } from "./util/types.ts";
import LoggedInRoute from "./components/LoggedInRoute.tsx";
import Game from "./pages/Game.tsx";
import GamesPortal from "./pages/GamesPortal.tsx";
import GameSection from "./pages/GameSection.tsx";
import MatchmakingQueue from "./pages/MatchmakingQueue.tsx";
import ThreadPage from "./pages/ThreadPage.tsx";
import { ErrorBoundary } from "react-error-boundary";
import fallback from "./fallback.tsx";
import NewThread from "./pages/NewThread.tsx";
import TimeContextKeeper from "./components/UpdatingTimeContext.tsx";
import ReplaysDiscovery from "./pages/ReplaysDiscovery.tsx";
import ReplayViewer from "./pages/ReplayViewer.tsx";
import StudyView from "./pages/StudyView.tsx";
import TrainerDashboard from "./pages/TrainerDashboard.tsx";
import NewTrainingRun from "./pages/NewTrainingRun.tsx";
import TrainingJobLive from "./pages/TrainingJobLive.tsx";
import ModelsBrowse from "./pages/ModelsBrowse.tsx";
import ModelCardPage from "./pages/ModelCardPage.tsx";
import ForkModelPage from "./pages/ForkModelPage.tsx";
import Puzzles from "./pages/Puzzles.tsx";
import Practice from "./pages/Practice.tsx";
import Leaderboards from "./pages/Leaderboards.tsx";

/** If `true`, all incoming socket messages will be logged */
const DEBUG_SOCKETS = false;

/**
 * Websocket connection for the app. It would be natural to define this in a
 * useEffect hook, but the React docts advise against this.
 * https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application
 * */
let socket: GameSocket | null = null;
if (typeof window !== "undefined") {
  socket = io();
  if (DEBUG_SOCKETS) {
    socket.onAny((tag, payload) => {
      console.log(`from socket got ${tag}(${JSON.stringify(payload)})`);
    });
  }
}

const AUTH_STORAGE_KEY = "gnarena:auth";

/**
 * Read the persisted auth context from localStorage, if any. Returns null on
 * any kind of parse / availability error so callers can fall back to the
 * "not logged in" state without crashing.
 */
function readPersistedAuth(): AuthContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthContext>;
    if (!parsed || !parsed.user || typeof parsed.pass !== "string") return null;
    // `reset` is a function and cannot be serialised; the App-level setter
    // injects a real reset callback below.
    return {
      user: parsed.user,
      pass: parsed.pass,
      reset: () => {},
    };
  } catch {
    return null;
  }
}

/**
 * Persist (or clear) the auth context in localStorage. We strip the `reset`
 * callback because functions are not JSON-serialisable; it gets re-injected
 * on rehydrate.
 */
function persistAuth(auth: AuthContext | null): void {
  if (typeof window === "undefined") return;
  try {
    if (auth === null) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user: auth.user, pass: auth.pass }),
      );
    }
  } catch {
    // localStorage can throw under e.g. quota / private browsing; ignore.
  }
}

function NoSuchRoute() {
  const { pathname } = useLocation();
  return `No page found for route '${pathname}'`;
}

export default function App() {
  const [auth, setAuthState] = useState<AuthContext | null>(() => readPersistedAuth());

  /**
   * Update auth state AND mirror to localStorage. We wrap setState so every
   * call site automatically stays in sync with the persisted value.
   */
  const setAuth = (next: AuthContext | null) => {
    persistAuth(next);
    setAuthState(next);
  };
  return (
    socket && (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login setAuth={setAuth} />} />
          <Route
            element={
              <LoggedInRoute auth={auth} socket={socket}>
                <TimeContextKeeper updateFrequency={20 * 1000}>
                  <ErrorBoundary fallbackRender={fallback}>
                    <Layout />
                  </ErrorBoundary>
                </TimeContextKeeper>
              </LoggedInRoute>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/forum" element={<ThreadList />} />
            <Route path="/forum/post/new" element={<NewThread />} />
            <Route path="/forum/post/:threadId" element={<ThreadPage />} />
            <Route path="/games" element={<GamesPortal />} />
            {/* The static "queue" segment must stay ahead of the dynamic
                :gameKey section route so /games/queue/nim is the queue. */}
            <Route path="/games/queue/:gameKey" element={<MatchmakingQueue />} />
            <Route path="/games/:gameKey" element={<GameSection />} />
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/game/:gameId" element={<Game />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/puzzles" element={<Puzzles />} />
            <Route path="/puzzles/practice" element={<Practice />} />
            <Route path="/replays" element={<ReplaysDiscovery />} />
            <Route path="/replays/:matchId" element={<ReplayViewer />} />
            <Route path="/study/:shareToken" element={<StudyView />} />
            <Route path="/trainer" element={<TrainerDashboard />} />
            <Route path="/trainer/new" element={<NewTrainingRun />} />
            <Route path="/trainer/jobs/:jobId" element={<TrainingJobLive />} />
            <Route path="/models" element={<ModelsBrowse />} />
            <Route path="/models/:modelId" element={<ModelCardPage />} />
            <Route path="/models/:modelId/fork" element={<ForkModelPage />} />
            <Route path="/*" element={<NoSuchRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    )
  );
}
