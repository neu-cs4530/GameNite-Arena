import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SideBarNav from "./SideBarNav.tsx";

function renderNav(initialEntry = "/"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SideBarNav />
    </MemoryRouter>,
  );
}

describe("SideBarNav: Home group", () => {
  it("is a link to / and starts expanded on /", () => {
    renderNav("/");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("home-menu-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Matchmaking" })).toBeInTheDocument();
  });

  it("starts expanded on a descendant route like /leaderboards", () => {
    renderNav("/leaderboards");
    expect(screen.getByTestId("home-menu-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  it("starts collapsed off Home routes", () => {
    renderNav("/trainer");
    expect(screen.getByTestId("home-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Matchmaking" })).not.toBeInTheDocument();
  });

  it("toggles open and closed on click", async () => {
    renderNav("/trainer");
    const toggle = screen.getByTestId("home-menu-toggle");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Matchmaking" })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Matchmaking" })).not.toBeInTheDocument();
  });
});

describe("SideBarNav: Puzzles dropdown (nested under Home)", () => {
  it("starts collapsed off puzzles routes", () => {
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

  it("the header links to /puzzles and the sub-links point at /puzzles/daily and /puzzles/practice", () => {
    renderNav("/puzzles/practice");
    expect(screen.getByRole("link", { name: "Puzzles" })).toHaveAttribute("href", "/puzzles");
    expect(screen.getByRole("link", { name: "Daily Puzzle" })).toHaveAttribute(
      "href",
      "/puzzles/daily",
    );
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute(
      "href",
      "/puzzles/practice",
    );
  });
});

describe("SideBarNav: Watch Games dropdown (nested under Home)", () => {
  it("starts collapsed off watch routes", () => {
    renderNav("/");
    expect(screen.getByTestId("watch-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Replays" })).not.toBeInTheDocument();
  });

  it("starts expanded when already on a watch route", () => {
    renderNav("/live");
    expect(screen.getByTestId("watch-menu-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Replays" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Live Games" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Highlights" })).toBeInTheDocument();
  });

  it("the header links to /watch and the sub-links point at /replays, /live, /highlights", () => {
    renderNav("/watch");
    expect(screen.getByRole("link", { name: "Watch Games" })).toHaveAttribute("href", "/watch");
    expect(screen.getByRole("link", { name: "Replays" })).toHaveAttribute("href", "/replays");
    expect(screen.getByRole("link", { name: "Live Games" })).toHaveAttribute("href", "/live");
    expect(screen.getByRole("link", { name: "Highlights" })).toHaveAttribute("href", "/highlights");
  });
});

describe("SideBarNav: AI dropdown", () => {
  it("starts collapsed off AI routes", () => {
    renderNav("/");
    expect(screen.getByRole("link", { name: "AI" })).toHaveAttribute("href", "/ai");
    expect(screen.getByTestId("ai-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Trainer" })).not.toBeInTheDocument();
  });

  it("starts expanded when already on an AI route", () => {
    renderNav("/models");
    expect(screen.getByTestId("ai-menu-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Trainer" })).toHaveAttribute("href", "/trainer");
    expect(screen.getByRole("link", { name: "Models" })).toHaveAttribute("href", "/models");
  });

  it("toggles open and closed on click", async () => {
    renderNav("/");
    const toggle = screen.getByTestId("ai-menu-toggle");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Trainer" })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Trainer" })).not.toBeInTheDocument();
  });

  it("the header links to /ai and starts expanded there", () => {
    renderNav("/ai");
    expect(screen.getByRole("link", { name: "AI" })).toHaveAttribute("href", "/ai");
    expect(screen.getByTestId("ai-menu-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Trainer" })).toHaveAttribute("href", "/trainer");
    expect(screen.getByRole("link", { name: "Models" })).toHaveAttribute("href", "/models");
  });
});

describe("SideBarNav: top-level structure", () => {
  it("renders Leaderboards and Forums as flat links inside Home", () => {
    renderNav("/");
    expect(screen.getByRole("link", { name: "Leaderboards" })).toHaveAttribute(
      "href",
      "/leaderboards",
    );
    expect(screen.getByRole("link", { name: "Forums" })).toHaveAttribute("href", "/forum");
  });

  it("does not render Profile or Following links", () => {
    renderNav("/");
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Following" })).not.toBeInTheDocument();
  });
});
