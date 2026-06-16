import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import FollowList from "./FollowList.tsx";

function user(username: string, extra: Partial<SafeUserInfo> = {}): SafeUserInfo {
  return { username, display: username.toUpperCase(), createdAt: new Date(0), ...extra };
}

function renderList(props: Partial<React.ComponentProps<typeof FollowList>> = {}) {
  const onFollow = vi.fn();
  const onUnfollow = vi.fn();
  render(
    <MemoryRouter>
      <FollowList
        users={[user("ada"), user("bob")]}
        viewerUsername="ada"
        isFollowing={(u) => u === "bob"}
        onFollow={onFollow}
        onUnfollow={onUnfollow}
        busy={null}
        emptyTitle="No one here"
        testId="list"
        {...props}
      />
    </MemoryRouter>,
  );
  return { onFollow, onUnfollow };
}

describe("FollowList", () => {
  it("renders an empty state when there are no users", () => {
    renderList({ users: [] });
    expect(screen.getByText("No one here")).toBeInTheDocument();
  });

  it("shows no follow button on the viewer's own row", () => {
    renderList();
    const rows = screen.getAllByTestId("follow-list-item");
    // Row 0 is "ada" (the viewer) → no button.
    expect(rows[0].querySelector("button")).toBeNull();
  });

  it("labels a followed user 'Following' and unfollows on click", () => {
    const { onUnfollow } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    expect(onUnfollow).toHaveBeenCalledWith("bob");
  });

  it("labels a not-followed user 'Follow' and follows on click", () => {
    const { onFollow } = renderList({ isFollowing: () => false });
    // ada is the viewer (no button), so the only button is bob's "Follow".
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(onFollow).toHaveBeenCalledWith("bob");
  });

  it("omits the button for AI accounts", () => {
    renderList({
      users: [user("bot", { isAi: true })],
      viewerUsername: "ada",
      isFollowing: () => false,
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
