import useLoginContext from "../hooks/useLoginContext.ts";
import "./Header.css";
import { useNavigate } from "react-router-dom";

/**
 * Header component that renders the main title.
 */
export default function Header() {
  const { user, reset } = useLoginContext();
  const navigate = useNavigate();

  return (
    <div id="header" className="header">
      <div className="title">GameNite!</div>
      <span className="header__user-label">signed in as {user.display}</span>
      <button
        className="narrow secondary"
        onClick={async () => {
          reset();
          await navigate("/login");
        }}
      >
        Log Out
      </button>
      <button className="narrow secondary" onClick={() => navigate(`/profile/${user.username}`)}>
        View Profile
      </button>
    </div>
  );
}
