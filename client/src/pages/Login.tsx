import useLoginForm from "../hooks/useLoginForm.ts";
import "./Login.css";
import { useState } from "react";
import type { AuthContext } from "../contexts/LoginContext.ts";

interface LoginProps {
  setAuth: (s: AuthContext | null) => void;
}

/**
 * Renders a login form with username and password inputs, password visibility toggle,
 * and error handling.
 */
export default function Login({ setAuth }: LoginProps) {
  const { mode, username, password, confirm, err, handleInputChange, handleSubmit, toggleMode } =
    useLoginForm(setAuth);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="container">
      <h1>GameNite</h1>
      <form className="login" onSubmit={(e) => handleSubmit(e)}>
        <h2>Log into GameNite</h2>
        <input
          type="text"
          value={username}
          onChange={(event) => handleInputChange(event, "username")}
          placeholder="Username"
          aria-label="Username"
          className="widefill"
        />
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => handleInputChange(event, "password")}
          placeholder="Password"
          aria-label="Password"
          className="widefill"
        />
        {mode === "signup" && (
          <input
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(event) => handleInputChange(event, "confirm")}
            placeholder="Confirm Password"
            aria-label="Confirm Password"
            className="widefill"
          />
        )}
        <div className="labeled-section">
          <input
            type="checkbox"
            id="showPasswordToggle"
            checked={showPassword}
            onChange={() => setShowPassword((prevShowPassword) => !prevShowPassword)}
          />
          <label htmlFor="showPasswordToggle">Show Password</label>
        </div>
        {err && <p className="error-message centered">{err}</p>}
        <button type="submit" className="widefill primary">
          {mode === "signup" ? "Sign Up" : "Log In"}
        </button>
        <div className="intertext">or</div>
        <button
          className="narrowcenter secondary"
          onClick={(e) => {
            e.preventDefault();
            toggleMode();
          }}
        >
          {mode === "signup" ? "Use Existing Account" : "Create New Account"}
        </button>
      </form>
      <div className="smallAndGray" style={{ marginTop: "1rem" }}>
        GameNite stores passwords in cleartext; reusing passwords here is a catastrophically bad
        idea
      </div>
    </div>
  );
}
