import "./Header.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useLoginContext from "../hooks/useLoginContext.ts";
import Avatar from "./ui/Avatar.tsx";
import IconButton from "./ui/IconButton.tsx";

const homeIcon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

export default function Header() {
  const { user, reset } = useLoginContext();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <div id="header" className="header">
      <div className="title">FourNight!</div>
      <IconButton
        icon={homeIcon}
        aria-label="Go to home"
        onClick={() => void navigate("/")}
        data-testid="header-home-button"
      />
      <div className="header__profile" ref={menuRef}>
        <button
          type="button"
          className="header__profile-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="profile-menu-toggle"
        >
          <Avatar name={user.display} size="md" />
        </button>
        {menuOpen && (
          <div className="header__menu" role="menu" data-testid="profile-menu">
            <span className="header__menu-label">Signed in as {user.display}</span>
            <button
              type="button"
              role="menuitem"
              className="header__menu-item"
              onClick={() => {
                setMenuOpen(false);
                void navigate(`/profile/${user.username}`);
              }}
            >
              View Profile
            </button>
            <button
              type="button"
              role="menuitem"
              className="header__menu-item"
              onClick={async () => {
                setMenuOpen(false);
                reset();
                await navigate("/login");
              }}
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
