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
      signed in as {user.display}
      <button
        className="narrowcenter secondary"
        onClick={async () => {
          reset();
          await navigate("/login");
        }}
      >
        Log Out
      </button>
      <button
        className="narrowcenter secondary"
        onClick={() => navigate(`/profile/${user.username}`)}
      >
        View Profile
      </button>
    </div>
  );
}
