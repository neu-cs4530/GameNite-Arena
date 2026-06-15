import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import SideBarNav from "./SideBarNav.tsx";

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function renderNav(initialEntry = "/"): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <SideBarNav />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

describe("SideBarNav: Puzzles dropdown", () => {
  it("starts collapsed off the puzzles routes", () => {
    renderNav("/");
    expect(screen.getByTestId("puzzles-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Daily Puzzle" })).not.toBeInTheDocument();
  });

  it("starts expanded when already on a puzzles route", () => {
    renderNav("/puzzles/practice");
    expect(screen.getByTestId("puzzles-menu-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Daily Puzzle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practice" })).toBeInTheDocument();
  });

  it("toggles open and closed on click", async () => {
    renderNav("/");
    const toggle = screen.getByTestId("puzzles-menu-toggle");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Daily Puzzle" })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Daily Puzzle" })).not.toBeInTheDocument();
  });

  it("the sub-links point at /puzzles and /puzzles/practice", () => {
    renderNav("/puzzles/practice");
    expect(screen.getByRole("link", { name: "Daily Puzzle" })).toHaveAttribute("href", "/puzzles");
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute(
      "href",
      "/puzzles/practice",
    );
  });
});
