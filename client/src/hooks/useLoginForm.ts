import { type ChangeEvent, type SubmitEvent, useState } from "react";
import { loginUser, signupUser } from "../services/userService.ts";
import type { AuthContext } from "../contexts/LoginContext.ts";
import { useNavigate } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";

/**
 * Custom hook to manage login page logic.
 * @param setAuth - A callback for saving the database user
 * @returns An object containing:
 *   - mode: Either `'login'` or `'signup'`
 *   - toggleMode: Callback that toggles the mode
 *   - username: The current value of the username input
 *   - password: The current value of the password input.
 *   - confirm: The current value of the password confirmation input.
 *   - err: The current error message, if any.
 *   - handleInputChange: Function to handle changes in input fields.
 *   - handleSubmit: Function to handle form submission.
 */
export default function useLoginForm(setAuth: (auth: AuthContext | null) => void) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  /**
   * Validates the input fields for the form.
   * Ensures required fields are filled and passwords match (for signup).
   *
   * @returns {boolean} True if inputs are valid, false otherwise.
   */
  const validateInputs = (): boolean => {
    if (username.trim() === "" || password.trim() === "") {
      setErr("Please enter a username and password");
      return false;
    }

    if (mode === "signup" && confirm !== password) {
      setErr("Passwords don't match");
      return false;
    }

    return true;
  };

  /**
   * Handles changes in input fields and updates the corresponding state.
   *
   * @param e - The input change event.
   * @param field - The field being updated ('username', 'password', or 'confirm').
   */
  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement>,
    field: "username" | "password" | "confirm",
  ) => {
    if (field === "username") {
      setUsername(e.target.value);
    } else if (field === "password") {
      setPassword(e.target.value);
    } else {
      setConfirm(e.target.value);
    }
  };

  /**
   * Handles the submission of the form.
   * Validates input, performs login/signup, and navigates to the home page on
   * success.
   *
   * @param event - The form submission event.
   */
  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateInputs()) {
      return;
    }

    try {
      let user: SafeUserInfo;
      if (mode === "signup") {
        user = await signupUser({ username, password });
      } else {
        user = await loginUser({ username, password });
      }
      setAuth({ user, pass: password, reset: () => setAuth(null) });
      await navigate("/");
    } catch (err) {
      setErr(`${err}`);
    }
  };

  return {
    mode,
    toggleMode: () => setMode((m) => (m === "login" ? "signup" : "login")),
    username,
    password,
    confirm,
    err,
    handleInputChange,
    handleSubmit,
  };
}
