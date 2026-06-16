import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProfileSummary, SafeUserInfo } from "@gamenite/shared";
import Profile from "./Profile.tsx";
import { LoginContext } from "../contexts/LoginContext.ts";
import useReplaysForUser from "../hooks/useReplaysForUser.ts";
import useLiveBroadcasts from "../hooks/useLiveBroadcasts.ts";
import {
  follow,
  getFollowFeed,
  listFollowers,
  listFollowing,
  unfollow,
} from "../services/followService.ts";
import { getReplay, listReplaysForUser } from "../services/replayService.ts";
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
// stub the hook so page tests stay offline-deterministic. It's a vi.fn so
// individual tests can feed it a populated page (e.g. for "Load more").
vi.mock("../hooks/useReplaysForUser.ts", () => ({ default: vi.fn() }));

// Live-broadcast lookup, follow graph, and the replay service are all stubbed
// so the header's live indicator, the follow button, the watch-later tab, and
// the load-more path can be driven deterministically.
vi.mock("../hooks/useLiveBroadcasts.ts", () => ({ default: vi.fn() }));
vi.mock("../services/followService.ts", () => ({
  listFollowers: vi.fn(),
  listFollowing: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  getFollowFeed: vi.fn(),
}));
vi.mock("../services/replayService.ts", () => ({
  getReplay: vi.fn(),
  listReplaysForUser: vi.fn(),
}));

const mockedFetch = vi.mocked(getProfileSummary);
const mockedReplaysHook = vi.mocked(useReplaysForUser);
const mockedLive = vi.mocked(useLiveBroadcasts);
const mockedListReplays = vi.mocked(listReplaysForUser);
const mockedGetReplay = vi.mocked(getReplay);

const emptyPage = { page: { replays: [], total: 0, page: 1, pageSize: 12 }, loading: false };

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
  vi.clearAllMocks();
  mockedFetch.mockResolvedValue(profileSummaryFixture);
  mockedReplaysHook.mockReturnValue({ ...emptyPage, error: null, refetch: vi.fn() });
  mockedLive.mockReturnValue({ data: [], loading: false, error: null, refetch: vi.fn() });
  mockedListReplays.mockResolvedValue({ replays: [], total: 0, page: 1, pageSize: 12 });
  mockedGetReplay.mockResolvedValue(null as never);
  vi.mocked(listFollowers).mockResolvedValue([]);
  vi.mocked(listFollowing).mockResolvedValue([]);
  vi.mocked(follow).mockResolvedValue([]);
  vi.mocked(unfollow).mockResolvedValue([]);
  vi.mocked(getFollowFeed).mockResolvedValue({ following: [], replays: [] });
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

  it("'Clear filters' clears replay filters without leaving the active scope", async () => {
    // Deep-link into the nim scope with an extra replay filter applied. The
    // replay area is empty (stubbed hook), so its empty-state Clear button shows.
    renderProfile("/profile/user0?scope=nim&minElo=1600");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.getByTestId("scope-pill-nim")).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    // The scope survives the clear — it must not snap back to General.
    expect(screen.getByTestId("scope-pill-nim")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("scope-pill-general")).toHaveAttribute("aria-checked", "false");
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

describe("Profile page — tabs", () => {
  it("has no Overview tab; matches view is the default", async () => {
    renderProfile();
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-recent-matches")).toBeInTheDocument();
  });

  it("shows an owner-only Following tab with the follow feed", async () => {
    renderProfile("/profile/viewer9");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();

    const followingTab = screen.getByRole("tab", { name: "Following" });
    await userEvent.click(followingTab);
    expect(await screen.findByTestId("following-feed")).toBeInTheDocument();
  });

  it("hides the Following tab on someone else's profile", async () => {
    renderProfile("/profile/user0");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Following" })).not.toBeInTheDocument();
  });

  it("reaches the Followers/Following lists via the count links, with no dedicated tab button", async () => {
    renderProfile();
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Followers" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("profile-followers-count"));
    expect(await screen.findByTestId("profile-followers")).toBeInTheDocument();
    expect(screen.getByTestId("profile-following")).toBeInTheDocument();
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

describe("Profile page — live indicator", () => {
  it("links to the live broadcast when the user is currently playing one", async () => {
    mockedLive.mockReturnValue({
      data: [
        {
          broadcast: { broadcastId: "bc-1" },
          gameKey: "nim",
          players: [{ username: "user0", isAi: false }],
          elo: null,
          startedAt: "2026-06-01",
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderProfile("/profile/user0");
    const indicator = await screen.findByTestId("profile-live-indicator");
    expect(indicator).toHaveAttribute("href", "/live/bc-1");
  });
});

describe("Profile page — follow button (non-owner)", () => {
  it("shows Follow and calls the follow service when clicked", async () => {
    renderProfile("/profile/user0"); // viewer is viewer9, so not the owner
    const button = await screen.findByRole("button", { name: "Follow" });

    await userEvent.click(button);
    expect(vi.mocked(follow)).toHaveBeenCalledWith(
      "user0",
      expect.objectContaining({ username: "viewer9" }),
    );
  });
});

describe("Profile page — settings tab", () => {
  it("shows an owner-only notice on someone else's settings tab", async () => {
    renderProfile("/profile/user0?tab=settings");
    expect(await screen.findByText(/owner-only/i)).toBeInTheDocument();
    expect(screen.queryByTestId("profile-settings")).not.toBeInTheDocument();
  });
});

describe("Profile page — watch-later tab", () => {
  it("renders an empty state when nothing is starred", async () => {
    window.localStorage.removeItem("gnarena:watchLater");
    renderProfile("/profile/viewer9?tab=watch-later");
    expect(await screen.findByText(/watch later list is empty/i)).toBeInTheDocument();
  });
});

describe("Profile page — recent matches list", () => {
  it("shows Load more and fetches the next page when there are more matches", async () => {
    const replay = profileSummaryFixture.general.mostViewed;
    if (!replay) throw new Error("fixture is missing a most-viewed replay");
    // One replay shown out of five total → the Load more button appears.
    mockedReplaysHook.mockReturnValue({
      page: { replays: [replay], total: 5, page: 1, pageSize: 12 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockedListReplays.mockResolvedValue({
      replays: [{ ...replay, matchId: "m-extra" }],
      total: 5,
      page: 2,
      pageSize: 12,
    });

    renderProfile("/profile/user0");
    const loadMore = await screen.findByRole("button", { name: /load more/i });
    await userEvent.click(loadMore);
    expect(mockedListReplays).toHaveBeenCalled();
  });
});

describe("Profile page — edge data states", () => {
  it("errors when the route has no username", async () => {
    render(
      <LoginContext.Provider
        value={{ user: viewerUser, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
      >
        <MemoryRouter initialEntries={["/profile"]}>
          <Routes>
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </MemoryRouter>
      </LoginContext.Provider>,
    );
    // No username → the producer rejects and the generic error state shows.
    expect(await screen.findByTestId("error-state")).toBeInTheDocument();
  });

  it("shows match skeletons while the first page of replays is loading", async () => {
    mockedReplaysHook.mockReturnValue({
      page: { replays: [], total: 0, page: 1, pageSize: 12 },
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderProfile("/profile/user0");
    expect(await screen.findByTestId("profile-recent-matches")).toBeInTheDocument();
    expect(screen.getByTestId("match-grid")).toBeInTheDocument();
  });

  it("does not re-pin the game when the URL already carries one", async () => {
    renderProfile("/profile/user0?scope=nim&game=nim");
    expect(await screen.findByTestId("scope-pill-nim")).toHaveAttribute("aria-checked", "true");
  });

  it("clears filters from the general scope (no scope param to preserve)", async () => {
    renderProfile("/profile/user0"); // general scope, empty replays → empty-state Clear
    const clear = await screen.findByRole("button", { name: "Clear filters" });
    await userEvent.click(clear);
    expect(screen.getByTestId("scope-pill-general")).toHaveAttribute("aria-checked", "true");
  });

  it("shows an unrated puzzle chip when the puzzle rating is null", async () => {
    const summary = cloneFixture();
    summary.puzzles.overallRating = null; // still has per-game data → chip shows
    mockedFetch.mockResolvedValue(summary);
    renderProfile();
    await screen.findByTestId("profile-header");
    const chips = screen.getAllByTestId("elo-chip");
    const puzzleChip = chips.find((c) => /Puzzles/.test(c.textContent ?? ""));
    expect(puzzleChip).toHaveTextContent("Unrated");
  });

  it("lists starred replays on the watch-later tab", async () => {
    const replay = profileSummaryFixture.general.mostViewed;
    if (!replay) throw new Error("fixture missing most-viewed replay");
    window.localStorage.setItem("gnarena:watchLater", JSON.stringify(["m-gen-1"]));
    // The store snapshot was read at import; nudge it to re-read localStorage.
    window.dispatchEvent(new Event("storage"));
    mockedGetReplay.mockResolvedValue({
      ...replay,
      moves: [],
      gameId: "g",
      initialState: {},
    });

    renderProfile("/profile/viewer9?tab=watch-later");
    expect(await screen.findByTestId("profile-watch-later")).toBeInTheDocument();
    expect(await screen.findByTestId("match-grid")).toBeInTheDocument();
    window.localStorage.removeItem("gnarena:watchLater");
  });
});

describe("Profile page — scope and tab states", () => {
  it("returns to the general scope when the General pill is clicked", async () => {
    renderProfile("/profile/user0?scope=nim");
    expect(await screen.findByTestId("profile-header")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("scope-pill-general"));
    expect(screen.getByTestId("scope-pill-general")).toHaveAttribute("aria-checked", "true");
  });

  it("renders the settings form on the owner's settings tab", async () => {
    renderProfile("/profile/viewer9?tab=settings");
    expect(await screen.findByTestId("profile-settings")).toBeInTheDocument();
  });

  it("marks the Watch later tab active when it is selected", async () => {
    renderProfile("/profile/viewer9?tab=watch-later");
    const tab = await screen.findByRole("tab", { name: "Watch later" });
    expect(tab).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the Edit profile tab active when settings is selected", async () => {
    renderProfile("/profile/viewer9?tab=settings");
    const tab = await screen.findByRole("tab", { name: "Edit profile" });
    expect(tab).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Profile page — already-following state", () => {
  it("shows Following and unfollows when the viewer already follows the profile", async () => {
    // The viewer (viewer9) already follows user0.
    vi.mocked(listFollowing).mockResolvedValue([
      { username: "user0", display: "User Zero", createdAt: new Date(0) },
    ]);

    renderProfile("/profile/user0");
    const button = await screen.findByRole("button", { name: "Following" });

    await userEvent.click(button);
    expect(vi.mocked(unfollow)).toHaveBeenCalledWith(
      "user0",
      expect.objectContaining({ username: "viewer9" }),
    );
  });
});
