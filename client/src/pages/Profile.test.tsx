import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProfileSummary, SafeUserInfo } from "@gamenite/shared";
import Profile from "./Profile.tsx";
import { LoginContext } from "../contexts/LoginContext.ts";
import { getProfileSummary, ProfileNotFoundError } from "../services/profileService.ts";
import {
  profileSummaryFixture,
  freshProfileSummaryFixture,
} from "../__fixtures__/profileSummary.ts";
import type { GameSocket } from "../util/types.ts";

vi.mock("../services/profileService.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../services/profileService.ts")>();
  return { ...mod, getProfileSummary: vi.fn() };
});

// The replay list area is an EXISTING surface with its own service tests;
// stub the hook so page tests stay offline-deterministic.
vi.mock("../hooks/useReplaysForUser.ts", () => ({
  default: () => ({
    page: { replays: [], total: 0, page: 1, pageSize: 12 },
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));

const mockedFetch = vi.mocked(getProfileSummary);

const viewerUser: SafeUserInfo = {
  username: "viewer9",
  display: "Viewer Nine",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function renderProfile(url = "/profile/user0"): void {
  render(
    <LoginContext.Provider
      value={{ user: viewerUser, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

/** Deep-clone the fixture so a test can null out one branch honestly. */
function cloneFixture(): ProfileSummary {
  return structuredClone(profileSummaryFixture);
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue(profileSummaryFixture);
});

describe("Profile page — scope pills", () => {
  it("defaults to General and swaps heatmap/stats/hero when a game pill is clicked", async () => {
    renderProfile();
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // General slice of the fixture.
    const generalPill = screen.getByTestId("scope-pill-general");
    expect(generalPill).toHaveAttribute("role", "radio");
    expect(generalPill).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Sunday 00:00, 5 matches")).toBeInTheDocument();
    expect(screen.getByTestId("profile-stat-total")).toHaveTextContent("42");
    expect(screen.getByTestId("profile-stat-peak-elo")).toHaveTextContent("1725");
    expect(screen.getByTestId("profile-stat-avg-elo")).toHaveTextContent("1610");
    const hero = screen.getByTestId("profile-hero-replay");
    expect(within(hero).getByRole("link")).toHaveAttribute("href", "/replays/m-gen-1");
    expect(hero).toHaveTextContent("87");
    expect(screen.getByTestId("profile-best-ai")).toHaveTextContent("Nimbus Prime");

    // Switch to the nim scope: every element re-reads from perGame[nim].
    await userEvent.click(screen.getByTestId("scope-pill-nim"));
    expect(screen.getByTestId("scope-pill-nim")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Sunday 00:00, 3 matches")).toBeInTheDocument();
    expect(screen.getByTestId("profile-stat-total")).toHaveTextContent("30");
    expect(screen.getByTestId("profile-stat-current-elo")).toHaveTextContent("1640");
    expect(screen.getByTestId("profile-stat-peak-elo")).toHaveTextContent("1725");
    expect(screen.getByTestId("profile-stat-avg-elo")).toHaveTextContent("1602");
    const nimHero = screen.getByTestId("profile-hero-replay");
    expect(within(nimHero).getByRole("link")).toHaveAttribute("href", "/replays/m-nim-1");
    expect(nimHero).toHaveTextContent("41");
    // The best-AI card is a General-only element.
    expect(screen.queryByTestId("profile-best-ai")).not.toBeInTheDocument();
    // Pill switching is client-side: still exactly one fetch.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("honors a ?scope= deep link", async () => {
    renderProfile("/profile/user0?scope=guess");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.getByTestId("scope-pill-guess")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("profile-stat-total")).toHaveTextContent("12");
    expect(screen.getByTestId("profile-stat-current-elo")).toHaveTextContent("1580");
    expect(screen.getByLabelText("Monday 13:00, 2 matches")).toBeInTheDocument();
  });

  it("renders an honest empty scope for a game the user never played", async () => {
    renderProfile("/profile/user0?scope=checkers");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.getByTestId("profile-scope-empty")).toHaveTextContent(/no checkers matches/i);
    expect(screen.queryByTestId("profile-hero-replay")).not.toBeInTheDocument();
    // The filtered replay area still renders (pre-filtered, honestly empty).
    expect(screen.getByTestId("profile-recent-matches")).toBeInTheDocument();
  });
});

describe("Profile page — puzzles scope", () => {
  it("hides the replay area and renders streak + solve rate from the fixture", async () => {
    renderProfile("/profile/user0?scope=puzzles");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.getByTestId("scope-pill-puzzles")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("profile-recent-matches")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-heatmap")).not.toBeInTheDocument();
    const streak = screen.getByTestId("puzzle-streak");
    expect(streak).toHaveTextContent("4");
    expect(streak).toHaveTextContent(/best 9/i);
    expect(screen.getByTestId("puzzle-stat-overall")).toHaveTextContent("1512");
    expect(screen.getByTestId("puzzle-stat-nim-solve-rate")).toHaveTextContent("71%");
    expect(within(screen.getByTestId("puzzle-attempts")).getAllByTestId("puzzle-attempt-row")) //
      .toHaveLength(3);
  });
});

describe("Profile page — best AI card", () => {
  it("renders the model, rating and record when present", async () => {
    renderProfile();
    const card = await screen.findByTestId("profile-best-ai");
    expect(card).toHaveTextContent("Nimbus Prime");
    expect(card).toHaveTextContent("1493");
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/models/model-7");
  });

  it("renders the honest empty state when the user has no rated AI", async () => {
    const summary = cloneFixture();
    summary.general.bestAi = null;
    mockedFetch.mockResolvedValue(summary);
    renderProfile();
    const card = await screen.findByTestId("profile-best-ai");
    expect(card).toHaveTextContent(/no rated ai yet/i);
    expect(card).toHaveTextContent(/deploy a model in the trainer/i);
  });
});

describe("Profile page — hero empty state", () => {
  it("renders an honest empty hero when no replay was ever watched", async () => {
    const summary = cloneFixture();
    summary.general.mostViewed = null;
    mockedFetch.mockResolvedValue(summary);
    renderProfile();
    expect(await screen.findByTestId("profile-hero-replay-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-hero-replay")).not.toBeInTheDocument();
  });
});

describe("Profile page — header", () => {
  it("shows overall elo, one chip per rated game, and a puzzle chip", async () => {
    renderProfile();
    expect(await screen.findByTestId("overall-elo")).toHaveTextContent("1725");
    const chips = screen.getAllByTestId("elo-chip");
    // nim + guess + puzzles
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.textContent).join(" ")).toMatch(/puzzles/i);
  });

  it('shows "Unrated" and zero chips for a fresh user', async () => {
    mockedFetch.mockResolvedValue(freshProfileSummaryFixture);
    renderProfile("/profile/user5");
    expect(await screen.findByTestId("overall-elo")).toHaveTextContent(/unrated/i);
    expect(screen.queryAllByTestId("elo-chip")).toHaveLength(0);
  });
});

describe("Profile page — fetch states", () => {
  it("renders the user-not-found state on a 404", async () => {
    mockedFetch.mockRejectedValue(new ProfileNotFoundError("ghost"));
    renderProfile("/profile/ghost");
    expect(await screen.findByText("User not found")).toBeInTheDocument();
    expect(screen.getByText(/couldn't find a user named "ghost"/i)).toBeInTheDocument();
  });

  it("renders the generic error state on any other failure", async () => {
    mockedFetch.mockRejectedValue(new Error("network down"));
    renderProfile();
    expect(await screen.findByTestId("error-state")).toBeInTheDocument();
    expect(screen.queryByText("User not found")).not.toBeInTheDocument();
  });
});
