import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useFollowFeed from "../../hooks/useFollowFeed.ts";
import { activeStories, feedReplaysChronological } from "../../util/followFeed.ts";
import FollowingFeedPanel from "./FollowingFeedPanel.tsx";

vi.mock("../../hooks/useFollowFeed.ts", () => ({ default: vi.fn() }));
vi.mock("../../util/followFeed.ts", () => ({
  activeStories: vi.fn(),
  feedReplaysChronological: vi.fn(),
}));
// MatchCard pulls in routing/avatars we don't care about here.
vi.mock("../replay/MatchCard.tsx", () => ({
  default: ({ match }: { match: { matchId: string } }) => (
    <div data-testid="feed-card">{match.matchId}</div>
  ),
}));

const mockedHook = vi.mocked(useFollowFeed);
const mockedStories = vi.mocked(activeStories);
const mockedReplays = vi.mocked(feedReplaysChronological);

// The hook returns an AsyncResult; only `data/loading/error/refetch` matter.
function feedState(over: Partial<ReturnType<typeof useFollowFeed>>) {
  return { data: null, loading: false, error: null, refetch: vi.fn(), ...over } as ReturnType<
    typeof useFollowFeed
  >;
}

function renderPanel() {
  render(
    <MemoryRouter>
      <FollowingFeedPanel viewerUsername="ada" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStories.mockReturnValue([]);
  mockedReplays.mockReturnValue([]);
});

describe("FollowingFeedPanel", () => {
  it("shows the 'no one playing' note and empty feed by default", () => {
    mockedHook.mockReturnValue(feedState({ data: { stories: [], replays: [] } as never }));
    renderPanel();
    expect(screen.getByText(/no one you follow is playing/i)).toBeInTheDocument();
    expect(screen.getByText(/your feed is empty/i)).toBeInTheDocument();
  });

  it("renders story avatars when followed users are live", () => {
    mockedHook.mockReturnValue(feedState({ data: {} as never }));
    mockedStories.mockReturnValue([
      { user: { username: "bob", display: "Bob" }, game: { gameId: "g1", type: "nim" } },
    ] as never);
    renderPanel();
    expect(screen.getByTestId("feed-story")).toHaveTextContent("Bob");
  });

  it("renders a card per replay in the feed", () => {
    mockedHook.mockReturnValue(feedState({ data: {} as never }));
    mockedReplays.mockReturnValue([{ matchId: "m1" }, { matchId: "m2" }] as never);
    renderPanel();
    expect(screen.getAllByTestId("feed-card")).toHaveLength(2);
  });

  it("shows skeletons while loading with no data", () => {
    mockedHook.mockReturnValue(feedState({ loading: true, data: null }));
    renderPanel();
    expect(screen.getByTestId("feed-skeleton")).toBeInTheDocument();
  });

  it("shows an error state when the feed fails", () => {
    mockedHook.mockReturnValue(feedState({ error: new Error("boom") }));
    renderPanel();
    expect(screen.getByText(/could not load your feed/i)).toBeInTheDocument();
  });
});
