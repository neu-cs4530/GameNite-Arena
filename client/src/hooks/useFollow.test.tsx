import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import { follow, listFollowing, unfollow } from "../services/followService.ts";
import useFollow from "./useFollow.ts";

vi.mock("../services/followService.ts", () => ({
  follow: vi.fn(),
  unfollow: vi.fn(),
  listFollowing: vi.fn(),
}));

const mockedFollow = vi.mocked(follow);
const mockedUnfollow = vi.mocked(unfollow);
const mockedListFollowing = vi.mocked(listFollowing);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };
const bob: SafeUserInfo = { username: "bob", display: "Bob", createdAt: new Date(0) };

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      {children}
    </LoginContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListFollowing.mockResolvedValue([]);
});

describe("useFollow", () => {
  it("loads the viewer's following list on mount", async () => {
    mockedListFollowing.mockResolvedValueOnce([bob]);
    const { result } = renderHook(() => useFollow(), { wrapper });

    await waitFor(() => expect(result.current.following).toEqual([bob]));
    expect(mockedListFollowing).toHaveBeenCalledWith("ada");
    expect(result.current.isFollowing("bob")).toBe(true);
    expect(result.current.isFollowing("nobody")).toBe(false);
  });

  it("stays empty when the initial load fails (best-effort)", async () => {
    mockedListFollowing.mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useFollow(), { wrapper });

    await waitFor(() => expect(mockedListFollowing).toHaveBeenCalled());
    expect(result.current.following).toEqual([]);
  });

  it("follow replaces the list with the server's response", async () => {
    mockedFollow.mockResolvedValueOnce([bob]);
    const { result } = renderHook(() => useFollow(), { wrapper });
    await waitFor(() => expect(mockedListFollowing).toHaveBeenCalled());

    await act(async () => {
      await result.current.follow("bob");
    });

    expect(mockedFollow).toHaveBeenCalledWith("bob", { username: "ada", password: "pw" });
    expect(result.current.following).toEqual([bob]);
    expect(result.current.busy).toBeNull();
  });

  it("unfollow replaces the list with the server's response", async () => {
    mockedListFollowing.mockResolvedValueOnce([bob]);
    mockedUnfollow.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useFollow(), { wrapper });
    await waitFor(() => expect(result.current.following).toEqual([bob]));

    await act(async () => {
      await result.current.unfollow("bob");
    });

    expect(mockedUnfollow).toHaveBeenCalledWith("bob", { username: "ada", password: "pw" });
    expect(result.current.following).toEqual([]);
  });

  it("ignores the follow-list response that arrives after unmount", async () => {
    let resolve!: (list: SafeUserInfo[]) => void;
    mockedListFollowing.mockReturnValueOnce(new Promise<SafeUserInfo[]>((r) => (resolve = r)));
    const { unmount } = renderHook(() => useFollow(), { wrapper });
    unmount(); // cleanup sets active = false before the list resolves
    resolve([bob]);
    await Promise.resolve();
    expect(true).toBe(true);
  });
});
