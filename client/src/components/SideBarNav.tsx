import "./SideBarNav.css";
import { useState } from "react";
import { NavLink, useLocation, type NavLinkRenderProps } from "react-router-dom";

const HOME_ROUTE_PREFIXES = [
  "/games",
  "/puzzles",
  "/watch",
  "/replays",
  "/live",
  "/highlights",
  "/leaderboards",
  "/forum",
];
const WATCH_ROUTE_PREFIXES = ["/watch", "/replays", "/live", "/highlights"];
const AI_ROUTE_PREFIXES = ["/ai", "/trainer", "/models"];

/**
 * The primary navigation menu. Home and AI are dropdown groups whose header
 * is both a link to the group's hub page and a collapse toggle; Puzzles and
 * Watch Games are the same pattern nested one level inside Home. Each
 * group's open state starts based on whether the current route falls under it.
 */
export default function SideBarNav() {
  const { pathname } = useLocation();

  const onHomeRoute = pathname === "/" || HOME_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  const onPuzzlesRoute = pathname.startsWith("/puzzles");
  const onWatchRoute = WATCH_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  const onAiRoute = AI_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  const [homeOpen, setHomeOpen] = useState(onHomeRoute);
  const [puzzlesOpen, setPuzzlesOpen] = useState(onPuzzlesRoute);
  const [watchOpen, setWatchOpen] = useState(onWatchRoute);
  const [aiOpen, setAiOpen] = useState(onAiRoute);

  const navClass = ({ isActive }: NavLinkRenderProps) =>
    `menu_button ${isActive ? "menu_selected" : ""}`;

  return (
    <nav className="sideBarNav" aria-label="Primary">
      <div className={`menu_group ${homeOpen ? "menu_group--open" : ""}`}>
        <div className="menu_group_header">
          <NavLink to="/" className={navClass} end>
            Home
          </NavLink>
          <button
            type="button"
            className="menu_chevron_btn"
            aria-expanded={homeOpen}
            aria-label="Toggle Home menu"
            onClick={() => setHomeOpen((open) => !open)}
            data-testid="home-menu-toggle"
          >
            <span className="menu_chevron" aria-hidden="true">
              ▸
            </span>
          </button>
        </div>
        {homeOpen && (
          <div className="menu_submenu">
            <NavLink to="/games" className={navClass}>
              Matchmaking
            </NavLink>

            <div className={`menu_group ${puzzlesOpen ? "menu_group--open" : ""}`}>
              <div className="menu_group_header">
                <NavLink to="/puzzles" className={navClass} end>
                  Puzzles
                </NavLink>
                <button
                  type="button"
                  className="menu_chevron_btn"
                  aria-expanded={puzzlesOpen}
                  aria-label="Toggle Puzzles menu"
                  onClick={() => setPuzzlesOpen((open) => !open)}
                  data-testid="puzzles-menu-toggle"
                >
                  <span className="menu_chevron" aria-hidden="true">
                    ▸
                  </span>
                </button>
              </div>
              {puzzlesOpen && (
                <div className="menu_submenu menu_submenu--dropdown">
                  <NavLink to="/puzzles/daily" className={navClass}>
                    Daily Puzzle
                  </NavLink>
                  <NavLink to="/puzzles/practice" className={navClass}>
                    Practice
                  </NavLink>
                </div>
              )}
            </div>

            <div className={`menu_group ${watchOpen ? "menu_group--open" : ""}`}>
              <div className="menu_group_header">
                <NavLink to="/watch" className={navClass} end>
                  Watch Games
                </NavLink>
                <button
                  type="button"
                  className="menu_chevron_btn"
                  aria-expanded={watchOpen}
                  aria-label="Toggle Watch Games menu"
                  onClick={() => setWatchOpen((open) => !open)}
                  data-testid="watch-menu-toggle"
                >
                  <span className="menu_chevron" aria-hidden="true">
                    ▸
                  </span>
                </button>
              </div>
              {watchOpen && (
                <div className="menu_submenu menu_submenu--dropdown">
                  <NavLink to="/replays" className={navClass}>
                    Replays
                  </NavLink>
                  <NavLink to="/live" className={navClass}>
                    Live Games
                  </NavLink>
                  <NavLink to="/highlights" className={navClass}>
                    Highlights
                  </NavLink>
                </div>
              )}
            </div>

            <NavLink to="/leaderboards" className={navClass}>
              Leaderboards
            </NavLink>
            <NavLink to="/forum" className={navClass}>
              Forums
            </NavLink>
          </div>
        )}
      </div>

      <div className={`menu_group ${aiOpen ? "menu_group--open" : ""}`}>
        <div className="menu_group_header">
          <NavLink to="/ai" className={navClass} end>
            AI
          </NavLink>
          <button
            type="button"
            className="menu_chevron_btn"
            aria-expanded={aiOpen}
            aria-label="Toggle AI menu"
            onClick={() => setAiOpen((open) => !open)}
            data-testid="ai-menu-toggle"
          >
            <span className="menu_chevron" aria-hidden="true">
              ▸
            </span>
          </button>
        </div>
        {aiOpen && (
          <div className="menu_submenu menu_submenu--dropdown">
            <NavLink to="/trainer" className={navClass}>
              Trainer
            </NavLink>
            <NavLink to="/models" className={navClass}>
              Models
            </NavLink>
          </div>
        )}
      </div>
    </nav>
  );
}
