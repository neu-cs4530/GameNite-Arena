import "./SideBarNav.css";
import { NavLink, type NavLinkRenderProps } from "react-router-dom";
import useAuth from "../hooks/useAuth.ts";

/**
 * The SideBarNav component contains the primary naviagation menu. It
 * highlights the currently selected page and triggers navigation when the
 * menu items are clicked.
 */
export default function SideBarNav() {
  const { username } = useAuth();

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
      <NavLink to="/puzzles" className={navClass}>
        Puzzles
      <NavLink to="/leaderboards" className={navClass}>
        Leaderboards
      </NavLink>
      <NavLink to="/forum" className={navClass}>
        Forum
      </NavLink>
      <NavLink to="/replays" className={navClass}>
        Replays
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
