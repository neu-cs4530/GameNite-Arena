import "./EditProfileSettings.css";
import { useState } from "react";
import useEditProfileForm from "../hooks/useEditProfileForm.ts";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";

/**
 * The legacy "edit profile" form, now a self-contained section the new
 * `<Profile>` page mounts at the bottom for the profile owner.
 */
export default function EditProfileSettings() {
  const [showPass, setShowPass] = useState(false);
  const { display, setDisplay, password, setPassword, confirm, setConfirm, err, handleSubmit } =
    useEditProfileForm();

  return (
    <Card
      className="ga-settings"
      data-testid="profile-settings-form"
      aria-label="Edit profile settings"
    >
      <form onSubmit={handleSubmit} className="ga-settings__form">
        <h3 className="ga-settings__heading">Display name</h3>
        <div className="ga-settings__row">
          <input
            className="widefill notTooWide"
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            aria-label="Display name"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDisplay(display ? "" : display)}
          >
            Clear
          </Button>
        </div>

        <hr />

        <h3 className="ga-settings__heading">Reset password</h3>
        <div className="ga-settings__row">
          <input
            type={showPass ? "text" : "password"}
            className="widefill notTooWide"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="New password"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPassword("");
              setConfirm("");
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Toggle show password"
            onClick={() => setShowPass((v) => !v)}
          >
            {showPass ? "Hide" : "Reveal"}
          </Button>
        </div>
        <div className="ga-settings__row">
          <input
            type={showPass ? "text" : "password"}
            className="widefill notTooWide"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label="Confirm new password"
          />
        </div>

        {err && <p className="error-message">{err}</p>}

        <div className="ga-settings__submit">
          <Button type="submit" variant="primary">
            Submit
          </Button>
        </div>
        <p className="smallAndGray">After updating your profile, you will be logged out</p>
      </form>
    </Card>
  );
}
