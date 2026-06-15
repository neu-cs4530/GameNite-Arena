import "./SideBarNav.css";
import { useState } from "react";
import { NavLink, useLocation, type NavLinkRenderProps } from "react-router-dom";
import useAuth from "../hooks/useAuth.ts";

/**
 * The SideBarNav component contains the primary naviagation menu. It
 * highlights the currently selected page and triggers navigation when the
 * menu items are clicked.
 */
export default function SideBarNav() {
  const { username } = useAuth();
  const location = useLocation();
  const onPuzzlesRoute = location.pathname.startsWith("/puzzles");
  const [puzzlesOpen, setPuzzlesOpen] = useState(onPuzzlesRoute);

  const navClass = ({ isActive }: NavLinkRenderProps) =>
    `menu_button ${isActive ? "menu_selected" : ""}`;

  return (
    <nav className="sideBarNav" aria-label="Primary">
      <NavLink to="/" className={navClass} end>
        Home
      </NavLink>
      <NavLink to="/games" className={navClass}>
        Games
      </NavLink>
      <div className={`menu_group ${puzzlesOpen ? "menu_group--open" : ""}`}>
        <button
          type="button"
          className="menu_button menu_dropdown_toggle"
          aria-expanded={puzzlesOpen}
          onClick={() => setPuzzlesOpen((open) => !open)}
          data-testid="puzzles-menu-toggle"
        >
          <span className="menu_label">Puzzles</span>
          <span className="menu_chevron" aria-hidden="true">
            ▸
          </span>
        </button>
        {puzzlesOpen && (
          <div className="menu_submenu">
            <NavLink to="/puzzles" className={navClass} end>
              Daily Puzzle
            </NavLink>
            <NavLink to="/puzzles/practice" className={navClass}>
              Practice
            </NavLink>
          </div>
        )}
      </div>
      <NavLink to="/leaderboards" className={navClass}>
        Leaderboards
      </NavLink>
      <NavLink to="/forum" className={navClass}>
        Forum
      </NavLink>
      <NavLink to="/replays" className={navClass}>
        Replays
      </NavLink>
      <NavLink to="/live" className={navClass}>
        Live Games
      </NavLink>
      <NavLink to="/following" className={navClass}>
        Following
      </NavLink>
      <NavLink to="/highlights" className={navClass}>
        Highlights
      </NavLink>
      <NavLink to="/trainer" className={navClass}>
        Trainer
      </NavLink>
      <NavLink to="/models" className={navClass}>
        Models
      </NavLink>
      <NavLink to={`/profile/${username}`} id="menu_user" className={navClass}>
        Profile
      </NavLink>
    </nav>
  );
}
