import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import { updateUser } from "../services/userService.ts";
import EditProfileSettings from "./EditProfileSettings.tsx";

vi.mock("../services/userService.ts", () => ({ updateUser: vi.fn() }));
const mockedUpdate = vi.mocked(updateUser);

const user: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };
const reset = vi.fn();

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <LoginContext.Provider value={{ user, pass: "pw", reset, socket: {} as GameSocket }}>
      {children}
    </LoginContext.Provider>
  );
}

function renderForm() {
  render(<EditProfileSettings />, { wrapper });
}

const nameInput = () => screen.getByLabelText("Display name");
const passInput = () => screen.getByLabelText("New password");
const confirmInput = () => screen.getByLabelText("Confirm new password");
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Submit" }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditProfileSettings validation", () => {
  it("blocks a submit with no changes", async () => {
    renderForm();
    submit();
    expect(await screen.findByText("No changes to submit")).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("rejects a display name padded with whitespace", async () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: "Ada " } });
    submit();
    expect(await screen.findByText(/can't begin or end with whitespace/i)).toBeInTheDocument();
  });

  it("rejects an empty display name", async () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: "" } });
    submit();
    expect(await screen.findByText(/please enter a display name/i)).toBeInTheDocument();
  });

  it("rejects mismatched passwords", async () => {
    renderForm();
    fireEvent.change(passInput(), { target: { value: "abc" } });
    fireEvent.change(confirmInput(), { target: { value: "xyz" } });
    submit();
    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
  });

  it("submits a valid display change and logs out via reset", async () => {
    mockedUpdate.mockResolvedValueOnce(user);
    renderForm();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    submit();

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        { username: "ada", password: "pw" },
        { display: "Ada Lovelace" },
      ),
    );
    expect(reset).toHaveBeenCalledOnce();
  });

  it("surfaces a server error without logging out", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("taken"));
    renderForm();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    submit();

    expect(await screen.findByText(/taken/i)).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });
});

describe("EditProfileSettings controls", () => {
  it("toggles password visibility", () => {
    renderForm();
    expect(passInput()).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByLabelText("Toggle show password"));
    expect(passInput()).toHaveAttribute("type", "text");
  });

  it("clears the password fields with Reset", () => {
    renderForm();
    fireEvent.change(passInput(), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(passInput()).toHaveValue("");
  });

  it("empties the display name with the Clear button", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(nameInput()).toHaveValue("");
  });
});
